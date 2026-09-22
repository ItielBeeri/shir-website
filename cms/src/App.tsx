/**
 * Sign-in, then the shell and whichever screen is open.
 *
 * Navigation is a stack, so Back always means "where I just was" - including
 * out of a post and back into its list. The drawer reaches everything from
 * anywhere, so going home first is never a required step.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from './api';
import type { PathChange } from './git/engine';
import { Shell } from './components/Shell';
import { StoreProvider, useStore } from './store';
import { screens, screenById } from './model/screens';
import type { Route } from './routes';
import { TomlForm } from './screens/TomlForm';
import { MdxEntry } from './screens/MdxEntry';
import { Collection } from './screens/Collection';
import { Images } from './screens/Images';
import { Recommendations } from './screens/Recommendations';
import { SiteDetails } from './screens/SiteDetails';
import { Legal } from './screens/Legal';
import { NewPost } from './screens/NewPost';
import { History, NavEditor, Pending } from './screens/Misc';
import { Preview } from './screens/Preview';

const GLYPHS: Record<string, string> = {
  pencil: '✍', book: '📚', quote: '💬', image: '🖼', home: '🏠', person: '🙋',
  leaf: '🌿', envelope: '✉', list: '☰', phone: '📞', scale: '⚖', question: '❓',
};

export default function App(): JSX.Element {
  const [state, setState] = useState<'checking' | 'out' | 'in' | 'broken'>('checking');
  const [session, setSession] = useState<{
    role: 'owner' | 'maintainer';
    login: string;
    repo: string;
    pending: PathChange[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let signedIn = false;
      try {
        signedIn = (await api.me()).signedIn;
      } catch {
        if (!cancelled) setState('out');
        return;
      }
      if (cancelled) return;
      if (!signedIn) {
        setState('out');
        return;
      }
      try {
        const start = await api.start();
        if (cancelled) return;
        setSession({ role: start.role, login: start.login, repo: start.repo, pending: start.pending });
        setState('in');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לפתוח את המערכת.');
        setState('broken');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state === 'checking') {
    return <main className="app center"><p className="muted">רגע…</p></main>;
  }

  if (state === 'broken') {
    return (
      <main className="app center">
        <div>
          <h1 style={{ fontWeight: 400 }}>לא הצלחתי לפתוח את המערכת</h1>
          <p className="banner error" style={{ maxInlineSize: '34ch', marginInline: 'auto' }}>{error}</p>
          <p className="center-actions">
            <button className="primary" onClick={() => setAttempt((n) => n + 1)}>נסי שוב</button>
            <a href="/api/auth/logout"><button className="ghost">התנתקות</button></a>
          </p>
        </div>
      </main>
    );
  }

  if (state === 'out' || !session) {
    return (
      <main className="app center">
        <div>
          <h1 style={{ fontWeight: 400 }}>עריכת האתר</h1>
          <p className="muted" style={{ maxInlineSize: '30ch', marginInline: 'auto' }}>
            כאן אפשר לשנות טקסטים, תמונות, פוסטים והמלצות באתר.
          </p>
          <p style={{ marginBlockStart: 24 }}>
            <a href="/api/auth/login"><button className="primary">התחברות</button></a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <StoreProvider
      role={session.role}
      login={session.login}
      repo={session.repo}
      initialPending={session.pending}
    >
      <Workspace />
    </StoreProvider>
  );
}

function Workspace(): JSX.Element {
  const [stack, setStack] = useState<Route[]>([{ kind: 'home' }]);
  const [drawer, setDrawer] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const route = stack[stack.length - 1];
  const go = useCallback((next: Route) => {
    setNotice(null);
    setError(null);
    setStack((prev) => [...prev, next]);
  }, []);
  const back = useCallback(() => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)), []);
  const home = useCallback(() => setStack([{ kind: 'home' }]), []);
  const replace = useCallback((next: Route) => setStack((prev) => [...prev.slice(0, -1), next]), []);

  const saved = (): void => setNotice('נשמר. עוד לא פורסם לאתר.');

  return (
    <Shell
      route={route}
      canGoBack={stack.length > 1}
      onBack={back}
      onHome={home}
      onGo={go}
      drawerOpen={drawer}
      setDrawerOpen={setDrawer}
    >
      {notice && <p className="banner">{notice}</p>}
      {error && <p className="banner error">{error}</p>}
      <Screen
        route={route}
        go={go}
        replace={replace}
        back={back}
        saved={saved}
        published={() => {
          setStack([{ kind: 'home' }]);
          setNotice('פורסם. השינוי יופיע באתר בתוך כדקה או שתיים.');
        }}
      />
    </Shell>
  );
}

function Screen({
  route,
  go,
  replace,
  back,
  saved,
  published,
}: {
  route: Route;
  go: (route: Route) => void;
  replace: (route: Route) => void;
  back: () => void;
  saved: () => void;
  published: () => void;
}): JSX.Element {
  const store = useStore();

  if (route.kind === 'home') {
    return (
      <>
        {store.pending.length > 0 && (
          <button className="pending-callout" onClick={() => go({ kind: 'preview' })}>
            <span className="glyph" aria-hidden="true">👁</span>
            <span>
              <b>
                {store.pending.length === 1
                  ? 'שינוי אחד ממתין לפרסום'
                  : `${store.pending.length} שינויים ממתינים לפרסום`}
              </b>
              <span className="muted">לצפייה באתר לפני הפרסום</span>
            </span>
          </button>
        )}
        <div className="cards">
        {screens
          .filter((s) => !s.advanced)
          .map((screen) => (
            <button key={screen.id} className="card" onClick={() => go({ kind: 'screen', id: screen.id })}>
              <span className="glyph" aria-hidden="true">{GLYPHS[screen.icon] ?? '•'}</span>
              <span className="label">{screen.title}</span>
              {screen.blurb && <span className="blurb">{screen.blurb}</span>}
            </button>
          ))}
        </div>
      </>
    );
  }

  if (route.kind === 'pending') return <Pending onDone={back} />;
  if (route.kind === 'preview') return <Preview onPublished={published} />;
  if (route.kind === 'history') return <History />;

  if (route.kind === 'new') {
    return <NewPost onCreated={(file) => replace({ kind: 'entry', id: 'blog', file })} />;
  }

  if (route.kind === 'entry') {
    const screen = screenById(route.id === 'blog' ? 'blog-new' : route.id);
    const dir = screenById(route.id).dir!;
    return (
      <MdxEntry
        path={`${dir}/${route.file}`}
        title={route.file.replace(/\.mdx$/, '')}
        fields={screen.frontmatter ?? []}
        deletable={route.id === 'blog'}
        onSaved={saved}
        onDeleted={back}
      />
    );
  }

  const screen = screenById(route.id);

  switch (screen.kind) {
    case 'toml':
      return screen.id === 'site' ? (
        <SiteDetails onSaved={saved} />
      ) : (
        <TomlForm screen={screen} role={store.role} onSaved={saved} />
      );

    case 'mdx':
      return (
        <MdxEntry
          path={screen.file!}
          title={screen.title}
          fields={screen.frontmatter ?? []}
          onSaved={saved}
        />
      );

    case 'collection':
      return screen.id === 'blog-new' ? (
        <NewPost onCreated={(file) => replace({ kind: 'entry', id: 'blog', file })} />
      ) : (
        <Collection
          dir={screen.dir!}
          kind={screen.id === 'blog' ? 'blog' : 'therapies'}
          onOpen={(file) => go({ kind: 'entry', id: screen.id, file })}
          onNew={screen.id === 'blog' ? () => go({ kind: 'new', id: 'blog-new' }) : undefined}
        />
      );

    case 'images':
      return <Images />;

    case 'recommendations':
      return <Recommendations />;

    case 'nav':
      return <NavEditor onSaved={saved} />;

    case 'sections':
      return <Legal />;

    default:
      return <p className="banner">המסך הזה עדיין בבנייה.</p>;
  }
}
