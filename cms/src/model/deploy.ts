/**
 * How a build in progress is described, in one place.
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
