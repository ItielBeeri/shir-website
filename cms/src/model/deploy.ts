/**
 * How a build in progress is described, and how long it is worth watching.
 *
 * Both the preview and the publish screen say the same words about the same
 * states, and the bar says a shorter version of them; the difference between
 * "queued" and "building" is the difference between nothing having started and
 * something taking a while.
 */
import type { DeployState } from '../api';

export const DEPLOY_WORDS: Record<DeployState['state'], string> = {
  none: 'מחכה שהבנייה תתחיל…',
  queued: 'בתור לבנייה…',
  building: 'בונה…',
  ready: 'מוכן',
  failed: 'הבנייה נכשלה',
  unknown: 'לא הצלחתי לקבל מצב בנייה.',
};

/** Long enough for a cold build, short enough not to poll into the evening. */
export const WATCH_LIMIT_MS = 10 * 60 * 1000;

/** The build reported, one way or the other. Nothing more will change. */
export const settled = (watch: Pick<DeployState, 'state'>): boolean =>
  watch.state === 'ready' || watch.state === 'failed';

/**
 * The watch has run out, so what is on screen is the last thing that will be.
 *
 * The store stops polling at the limit; a screen that does not know it is over
 * goes on counting a number nothing is behind any more, which is how a publish
 * that succeeded came to read "כבר 150 דקות" under a spinner. Vercel builds the
 * tip of a branch, so a second publish a minute after the first can leave the
 * first commit with no deployment of its own for ever - ordinary use, not a
 * fault, and the only honest end to it is to say so.
 */
export const gaveUp = (
  watch: Pick<DeployState, 'state'> & { since: number },
  now: number,
): boolean => !settled(watch) && now - watch.since > WATCH_LIMIT_MS;
