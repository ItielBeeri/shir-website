/**
 * The frame every screen sits in.
 *
 * The bar is fixed, not sticky-until-you-scroll: an owner three screens deep in
 * a long form needs to see where she is and how to get out without scrolling
 * back up to find out. The drawer makes every destination reachable from
 * anywhere, so "go home first" is never a required step.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { screens } from '../model/screens';
import { useStore } from '../store';
import type { Route } from '../routes';
import { routeTitle } from '../routes';

const GLYPHS: Record<string, string> = {
  pencil: '✍', book: '📚', quote: '💬', image: '🖼', home: '🏠', person: '🙋',
  leaf: '🌿', envelope: '✉', list: '☰', phone: '📞', scale: '⚖', question: '❓',
  clock: '🕐',
};

interface Props {
  route: Route;
  canGoBack: boolean;
  onBack: () => void;
  onHome: () => void;
  onGo: (route: Route) => void;
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
  drawerOpen,
  setDrawerOpen,
  children,
}: Props): JSX.Element {
  const store = useStore();
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    drawer.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
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

          <button className="bar-title" onClick={onHome} aria-label="למסך הראשי">
            {routeTitle(route)}
          </button>

          <button
            className="bar-button"
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
              {destinations.map((screen) => (
                <li key={screen.id}>
                  <button
                    className={'id' in route && route.id === screen.id ? 'is-current' : ''}
                    onClick={() => {
                      onGo({ kind: 'screen', id: screen.id });
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
                    onGo({ kind: 'history' });
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

      <main className="app" id="main">
        {children}
      </main>

      {store.pending.length > 0 && (
        <div className="tray" role="region" aria-label="שינויים שטרם פורסמו">
          <div className="tray-inner">
            <span className="count">
              {store.pending.length === 1
                ? 'שינוי אחד ממתין לפרסום'
                : `${store.pending.length} שינויים ממתינים לפרסום`}
            </span>
            <button className="ghost" onClick={() => onGo({ kind: 'pending' })}>
              מה שונה?
            </button>
            <button className="primary" onClick={() => onGo({ kind: 'preview' })}>
              צפייה ופרסום
            </button>
          </div>
        </div>
      )}
    </>
  );
}
