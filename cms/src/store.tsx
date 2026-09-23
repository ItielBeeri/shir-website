/**
 * One store for the things every screen needs: who is signed in, the image
 * gallery, and what is waiting to be published.
 *
 * The gallery lives here rather than in the picker because an upload from
 * inside a form has to be visible to the next form that opens, without a
 * reload the owner would have no reason to expect.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, FriendlyError } from './api';
import type { DeployState } from './api';
import type { PathChange } from './git/engine';
import { derivativeFor, rawUrl } from './lib/images';
import type { Derivatives } from './lib/images';
import type { GalleryImage } from './content/gallery';
import { WATCH_LIMIT_MS, settled } from './model/deploy';

const GALLERY_FILE = 'src/content/images.toml';
const DERIVATIVES_FILE = 'public/img/_opt/manifest.json';

export type Role = 'owner' | 'maintainer';

/** A publish being carried to the live site, watched until it lands. */
export interface DeployWatch extends DeployState {
  sha: string;
  /** When the watch began, so the wait is a number even before GitHub says so. */
  since: number;
  /** What this publish changed, for a link to the page rather than the site. */
  paths: PathChange[];
}

const POLL_MS = 5000;

interface Store {
  role: Role;
  login: string;
  repo: string;
  /** The published site's address, when this deployment was told it. */
  siteUrl?: string;
  pending: PathChange[];
  gallery: GalleryImage[];
  /** Object URLs for images uploaded this session, keyed by id. */
  freshPreviews: Record<string, string>;
  refreshPending: () => Promise<void>;
  refreshGallery: () => Promise<void>;
  /** Adds an image and its manifest entry in one commit; returns the new id. */
  addImage: (input: { fileName: string; path: string; base64: string; alt: string; previewUrl: string }) => Promise<string>;
  /**
   * Thumbnail URL for a gallery id. `width` is the size it will be painted
   * at; without one the original is served.
   */
  urlFor: (id: string, width?: number) => string | null;
  saved: (paths?: string[]) => void;
  /** The publish on its way to the site, or null when nothing is in flight. */
  deploy: DeployWatch | null;
  watchDeploy: (sha: string, paths: PathChange[]) => void;
  clearDeploy: () => void;
}

const StoreContext = createContext<Store | null>(null);

export const useStore = (): Store => {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside a provider');
  return store;
};

export function StoreProvider({
  role,
  login,
  repo,
  siteUrl,
  initialPending,
  children,
}: {
  role: Role;
  login: string;
  repo: string;
  siteUrl?: string;
  initialPending: PathChange[];
  children: ReactNode;
}): JSX.Element {
  const [pending, setPending] = useState<PathChange[]>(initialPending);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [freshPreviews, setFresh] = useState<Record<string, string>>({});
  const [derivatives, setDerivatives] = useState<Derivatives | null>(null);
  const [deploy, setDeploy] = useState<DeployWatch | null>(null);
  const [tick, setTick] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      setPending((await api.pending()).pending);
    } catch {
      /* advisory only - a failed refresh must never block editing */
    }
  }, []);

  // The TOML parsers arrive with the first gallery read rather than with the
  // landing screen, which needs neither of them.
  const refreshGallery = useCallback(async () => {
    const { content } = await api.read(GALLERY_FILE);
    if (!content) return;
    const { parseGallery } = await import('./content/gallery');
    setGallery(parseGallery(content));
  }, []);

  useEffect(() => {
    void refreshGallery().catch(() => undefined);
    // Advisory: without it every thumbnail is the original, which works.
    void api
      .read(DERIVATIVES_FILE)
      .then(({ content }) => content && setDerivatives(JSON.parse(content) as Derivatives))
      .catch(() => undefined);
  }, [refreshGallery]);

  const addImage = useCallback<Store['addImage']>(
    async ({ fileName, path, base64, alt, previewUrl }) => {
      const { content } = await api.read(GALLERY_FILE);
      if (!content) throw new FriendlyError('לא הצלחתי לקרוא את רשימת התמונות.');

      const [{ appendImage }, { parseGallery }] = await Promise.all([
        import('./content/toml-struct'),
        import('./content/gallery'),
      ]);
      const publicPath = path.replace(/^public/, '');
      const next = appendImage(content, { id: fileName, file: publicPath, alt });

      // One commit: the photo and its entry. Two commits is how an image ends
      // up on the site with no description, or a description with no image.
      // A decorative image has no description, and a subject ending in a bare
      // colon names nothing.
      await api.save(alt ? `הוספת תמונה: ${alt}` : 'הוספת תמונת קישוט', [
        { path, content: base64, encoding: 'base64' },
        { path: GALLERY_FILE, content: next },
      ]);

      setGallery(parseGallery(next));
      setFresh((prev) => ({ ...prev, [fileName]: previewUrl }));
      void refreshPending();
      return fileName;
    },
    [refreshPending],
  );

  const urlFor = useCallback<Store['urlFor']>(
    (id, width) => {
      if (freshPreviews[id]) return freshPreviews[id];
      const image = gallery.find((g) => g.id === id);
      if (!image) return null;

      // A picture waiting to be published may have been replaced since the
      // derivatives were built, and a stale thumbnail would show her the old
      // one. Those are served whole; everything settled gets the small copy.
      const waiting = pending.some((c) => c.path === `public${image.file}`);
      const small = waiting || !width ? null : derivativeFor(derivatives, image.file, width);
      return rawUrl(repo, 'content-draft', small ?? image.file);
    },
    [freshPreviews, gallery, repo, derivatives, pending],
  );

  const watchDeploy = useCallback((sha: string, paths: PathChange[]) => {
    setDeploy({ sha, state: 'queued', since: Date.now(), paths });
    setTick(0);
  }, []);

  const clearDeploy = useCallback(() => setDeploy(null), []);

  /**
   * Publishing is the one action whose result is not visible where she
   * pressed it: the commit lands in a second, the site changes a minute or two
   * later. Polling here rather than on one screen means she can carry on
   * working and still be told the moment it is live.
   */
  useEffect(() => {
    if (!deploy || settled(deploy) || Date.now() - deploy.since > WATCH_LIMIT_MS) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await api.status(deploy.sha);
        if (!cancelled) {
          setDeploy((prev) => (prev && prev.sha === deploy.sha ? { ...prev, ...status } : prev));
        }
      } catch {
        /* advisory only - a failed poll simply tries again */
      }
    })();
    const id = window.setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploy?.sha, deploy?.state, tick]);

  const saved = useCallback(() => void refreshPending(), [refreshPending]);

  const value = useMemo<Store>(
    () => ({
      role,
      login,
      repo,
      siteUrl,
      pending,
      gallery,
      freshPreviews,
      refreshPending,
      refreshGallery,
      addImage,
      urlFor,
      saved,
      deploy,
      watchDeploy,
      clearDeploy,
    }),
    [
      role,
      login,
      repo,
      siteUrl,
      pending,
      gallery,
      freshPreviews,
      refreshPending,
      refreshGallery,
      addImage,
      urlFor,
      saved,
      deploy,
      watchDeploy,
      clearDeploy,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
