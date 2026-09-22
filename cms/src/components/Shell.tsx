/**
 * The frame every screen sits in.
 *
 * The bar is fixed, not sticky-until-you-scroll: an owner three screens deep in
 * a long form needs to see where she is and how to get out without scrolling
 * back up to find out. The drawer makes every destination reachable from
 * anywhere, so "go home first" is never a required step.
 *
 * The bar's title is the page's `<h1>`. Every screen needs one - it is what a
 * screen reader announces and what `page-has-heading-one` checks for - and the
 * one thing that is always true of a screen is where it is.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { screens } from '../model/screens';
import { useStore } from '../store';
import type { Route } from '../routes';
import { routeTitle } from '../routes';
import { DeployChip } from '../screens/Deploy';

const GLYPHS: Record<string, string> = {
  pencil: '✍', book: '📚', quote: '💬', image: '🖼', home: '🏠', person: '🙋',
  leaf: '🌿', envelope: '✉', list: '☰', phone: '📞', scale: '⚖', question: '❓',
  clock: '🕐',
};

const FOCUSABLE = 'a[href], button:not(:disabled), input, [tabindex]:not([tabindex="-1"])';

interface Props {
  route: Route;
  canGoBack: boolean;
  onBack: () => void;
  onHome: () => void;
  onGo: (route: Route) => void;
  onJump: (route: Route) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  children: ReactNode;
}

export function Shell({
  route,
  canGoBack,
  onBack,
  onHome,
  onGo,
  onJump,
  drawerOpen,
  setDrawerOpen,
  children,
}: Props): JSX.Element {
  const store = useStore();
  const drawer = useRef<HTMLDivElement>(null);
  const hamburger = useRef<HTMLButtonElement>(null);

  /**
   * The drawer is a dialog, so it behaves like one: nothing behind it takes
   * focus or scrolls, and closing it puts focus back on the control that
   * opened it rather than at the top of the document.
   */
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawer.current) return;
      const stops = [...drawer.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    drawer.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      hamburger.current?.focus();
    };
  }, [drawerOpen, setDrawerOpen]);

  const destinations = [
    ...screens.filter((s) => !s.advanced),
    ...screens.filter((s) => s.advanced),
  ];

  return (
    <>
      <a className="skip" href="#main">דילוג לתוכן</a>

      <header className="bar">
        <div className="bar-inner">
          {canGoBack ? (
            <button className="bar-button" onClick={onBack} aria-label="חזרה">
              <span aria-hidden="true">→</span>
            </button>
          ) : (
            <span className="bar-button is-empty" aria-hidden="true" />
          )}

          <h1 className="bar-title">
            <button onClick={onHome} aria-label={`${routeTitle(route)} - למסך הראשי`}>
              {routeTitle(route)}
            </button>
          </h1>

          {route.kind !== 'deploy' && <DeployChip onOpen={() => onGo({ kind: 'deploy' })} />}

          {store.pending.length > 0 && route.kind !== 'preview' && (
            <button className="bar-publish" onClick={() => onGo({ kind: 'preview' })}>
              צפייה ופרסום
              <span className="badge">{store.pending.length}</span>
            </button>
          )}

          <button
            className="bar-button"
            ref={hamburger}
            onClick={() => setDrawerOpen(true)}
            aria-label="תפריט"
            aria-expanded={drawerOpen}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <nav
            className="drawer"
            ref={drawer}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="ניווט"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <span className="muted">שלום {store.login}</span>
              <button className="ghost" onClick={() => setDrawerOpen(false)} aria-label="סגירה">
                ✕
              </button>
            </div>

            <ul>
              <li>
                <button
                  className={route.kind === 'home' ? 'is-current' : ''}
                  onClick={() => {
                    onHome();
                    setDrawerOpen(false);
                  }}
                >
                  <span aria-hidden="true">🏠</span> המסך הראשי
                </button>
              </li>
              <li>
                <button
                  className={route.kind === 'preview' ? 'is-current' : ''}
                  onClick={() => {
                    onJump({ kind: 'preview' });
                    setDrawerOpen(false);
                  }}
                >
                  <span aria-hidden="true">👁</span> צפייה ופרסום
                  {store.pending.length > 0 && (
                    <span className="badge">{store.pending.length}</span>
                  )}
                </button>
              </li>
              {destinations.map((screen) => (
                <li key={screen.id}>
                  <button
                    className={'id' in route && route.id === screen.id ? 'is-current' : ''}
                    onClick={() => {
                      onJump({ kind: 'screen', id: screen.id });
                      setDrawerOpen(false);
                    }}
                  >
                    <span aria-hidden="true">{GLYPHS[screen.icon] ?? '•'}</span> {screen.title}
                  </button>
                </li>
              ))}
              <li>
                <button
                  className={route.kind === 'history' ? 'is-current' : ''}
                  onClick={() => {
                    onJump({ kind: 'history' });
                    setDrawerOpen(false);
                  }}
                >
                  <span aria-hidden="true">🕐</span> היסטוריה ושחזור
                </button>
              </li>
            </ul>

            <div className="drawer-foot">
              <a href="/api/auth/logout">
                <button className="ghost">התנתקות</button>
              </a>
            </div>
          </nav>
        </div>
      )}

      <main className={route.kind === 'preview' ? 'app is-wide' : 'app'} id="main">
        {children}
      </main>
    </>
  );
}
