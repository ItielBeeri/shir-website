/**
 * Today, where the owner is.
 *
 * `toISOString()` is UTC, so between midnight and 03:00 Israel time it names
 * yesterday. That is a wrong date on a dated legal declaration, and a post
 * filed under the wrong day.
 */
export const todayInIsrael = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
