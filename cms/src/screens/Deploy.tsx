/**
 * What happened after she pressed publish.
 *
 * The commit lands in a second and the site changes a minute or two later, so
 * "פורסם" on its own asks her to take the result on trust and go look. This
 * screen watches the build instead and says, in words, when the change is
 * actually on the site - or that it failed, which she would otherwise discover
 * by someone telling her the page looks wrong.
 *
 * The watch lives in the store, so leaving this screen does not abandon it:
 * the bar keeps the same status wherever she goes next.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { DEPLOY_WORDS } from '../model/deploy';
import { pagesFor } from '../model/pages';
import type { PageInput } from '../model/pages';

/**
 * Where to send her to look at what she just published.
 *
 * GitHub reports the deployment's own URL, which is an immutable snapshot of
 * one build: right today, frozen forever, and not an address she could give
 * anybody. The site's own address and the page she changed is what "see it on
 * the site" means; the deployment URL is the fallback for a deployment that
 * has not been told where the site lives.
 *
 * The page comes from `pagesFor`, so publishing a deletion lands on the
 * listing rather than on the 404 the page has just become.
 */
export function siteLink(
  siteUrl: string | undefined,
  paths: readonly PageInput[],
  deploymentUrl: string | undefined,
): string | undefined {
  if (!siteUrl) return deploymentUrl;
  return `${siteUrl.replace(/\/$/, '')}${pagesFor(paths)[0].to}`;
}

/** Rounded to something a person would say out loud. Hebrew counts one and two. */
function waited(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    if (seconds <= 1) return 'שנייה';
    if (seconds === 2) return 'שתי שניות';
    return `${seconds} שניות`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return 'דקה';
  if (minutes === 2) return 'שתי דקות';
  return `${minutes} דקות`;
}

export function Deploy({ onDone }: { onDone: () => void }): JSX.Element {
  const store = useStore();
  const watch = store.deploy;
  // Ticks the elapsed reading, which nothing else would re-render.
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!watch) {
    return (
      <>
        <p className="banner">הכול פורסם.</p>
        <div className="save-row">
          <button className="primary" onClick={onDone}>
            חזרה למסך הראשי
          </button>
        </div>
      </>
    );
  }

  const elapsed = waited(Date.now() - watch.since);
  const link = siteLink(store.siteUrl, watch.paths, watch.url);
  const done = watch.state === 'ready';
  const failed = watch.state === 'failed';
  const stalled = watch.state === 'unknown';

  return (
    <>
      <section className={`group deploy-card is-${watch.state}`}>
        <h2>
          {done ? 'השינוי באתר' : failed ? 'הבנייה נכשלה' : 'מעלה את השינוי לאתר'}
        </h2>

        <p className="deploy-state" role="status">
          {!done && !failed && !stalled && <span className="spinner" aria-hidden="true" />}
          {done
            ? 'אפשר לראות אותו עכשיו.'
            : failed
              ? 'השינוי נשמר ולא אבד, אבל הוא לא עלה לאתר.'
              : stalled
                ? 'לא הצלחתי לקבל מצב בנייה. השינוי נשמר, וכדאי לבדוק באתר בעוד דקה.'
                : `${DEPLOY_WORDS[watch.state]} כבר ${elapsed}.`}
        </p>

        {!done && !failed && !stalled && (
          <p className="muted">
            אפשר להישאר כאן או להמשיך לעבוד - הסטטוס ימשיך להופיע בסרגל העליון.
          </p>
        )}

        {failed && <p className="muted">שווה לפנות לאיתיאל עם השעה שבה זה קרה.</p>}
      </section>

      <div className="save-row">
        {done && link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="as-button primary">
            צפייה באתר
          </a>
        )}
        <button
          className={done && link ? 'ghost' : 'primary'}
          onClick={() => {
            if (done || failed) store.clearDeploy();
            onDone();
          }}
        >
          {done || failed ? 'חזרה למסך הראשי' : 'להמשיך לעבוד'}
        </button>
      </div>
    </>
  );
}

/** The same watch, small enough for the bar on every other screen. */
export function DeployChip({ onOpen }: { onOpen: () => void }): JSX.Element | null {
  const store = useStore();
  const watch = store.deploy;
  if (!watch) return null;

  const done = watch.state === 'ready';
  const failed = watch.state === 'failed';

  return (
    <button className={`bar-deploy is-${watch.state}`} onClick={onOpen}>
      {!done && !failed && <span className="spinner" aria-hidden="true" />}
      {done ? 'עלה לאתר' : failed ? 'הפרסום נכשל' : 'מעלה לאתר…'}
    </button>
  );
}
