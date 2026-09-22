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
import type { PathChange } from './git/engine';
import { parseGallery, rawUrl } from './lib/images';
import type { GalleryImage } from './lib/images';
import { appendImage } from './content/toml-struct';

const GALLERY_FILE = 'src/content/images.toml';

export type Role = 'owner' | 'maintainer';

interface Store {
  role: Role;
  login: string;
  repo: string;
  pending: PathChange[];
  gallery: GalleryImage[];
  /** Object URLs for images uploaded this session, keyed by id. */
  freshPreviews: Record<string, string>;
  refreshPending: () => Promise<void>;
  refreshGallery: () => Promise<void>;
  /** Adds an image and its manifest entry in one commit; returns the new id. */
  addImage: (input: { fileName: string; path: string; base64: string; alt: string; previewUrl: string }) => Promise<string>;
  /** Thumbnail URL for a gallery id. */
  urlFor: (id: string) => string | null;
  saved: (paths?: string[]) => void;
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
  initialPending,
  children,
}: {
  role: Role;
  login: string;
  repo: string;
  initialPending: PathChange[];
  children: ReactNode;
}): JSX.Element {
  const [pending, setPending] = useState<PathChange[]>(initialPending);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [freshPreviews, setFresh] = useState<Record<string, string>>({});

  const refreshPending = useCallback(async () => {
    try {
      setPending((await api.pending()).pending);
    } catch {
      /* advisory only - a failed refresh must never block editing */
    }
  }, []);

  const refreshGallery = useCallback(async () => {
    const { content } = await api.read(GALLERY_FILE);
    if (content) setGallery(parseGallery(content));
  }, []);

  useEffect(() => {
    void refreshGallery().catch(() => undefined);
  }, [refreshGallery]);

  const addImage = useCallback<Store['addImage']>(
    async ({ fileName, path, base64, alt, previewUrl }) => {
      const { content } = await api.read(GALLERY_FILE);
      if (!content) throw new FriendlyError('לא הצלחתי לקרוא את רשימת התמונות.');

      const publicPath = path.replace(/^public/, '');
      const next = appendImage(content, { id: fileName, file: publicPath, alt });

      // One commit: the photo and its entry. Two commits is how an image ends
      // up on the site with no description, or a description with no image.
      await api.save(`הוספת תמונה: ${alt}`, [
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
    (id) => {
      if (freshPreviews[id]) return freshPreviews[id];
      const image = gallery.find((g) => g.id === id);
      return image ? rawUrl(repo, 'content-draft', image.file) : null;
    },
    [freshPreviews, gallery, repo],
  );

  const saved = useCallback(() => void refreshPending(), [refreshPending]);

  const value = useMemo<Store>(
    () => ({
      role,
      login,
      repo,
      pending,
      gallery,
      freshPreviews,
      refreshPending,
      refreshGallery,
      addImage,
      urlFor,
      saved,
    }),
    [role, login, repo, pending, gallery, freshPreviews, refreshPending, refreshGallery, addImage, urlFor, saved],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
