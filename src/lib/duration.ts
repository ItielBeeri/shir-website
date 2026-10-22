/**
 * A length of time, as SoftVideo shows it and as it is read aloud. Shared by
 * the component at build time and by its player script, which keeps both
 * current while the video plays.
 */

/** "0:33", "12:05", "1:02:03". Western digits, read left to right. */
export function clock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * "33 שניות", "דקה אחת ו-5 שניות". A screen reader reads "0:33" as a clock
 * time or as digits and punctuation, so anything announced uses words - the
 * same whole seconds `clock` shows.
 */
export function spoken(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const m = Math.floor(t / 60);
  const s = t % 60;
  const minutes = m === 0 ? '' : m === 1 ? 'דקה אחת' : m === 2 ? 'שתי דקות' : `${m} דקות`;
  const secs = s === 0 ? '' : s === 1 ? 'שנייה אחת' : s === 2 ? 'שתי שניות' : `${s} שניות`;
  if (minutes && secs) return `${minutes} ו-${secs}`;
  return minutes || secs || '0 שניות';
}

/** ISO 8601, for VideoObject: "PT33S", "PT1M5S". */
export function isoDuration(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `PT${m ? `${m}M` : ''}${s || !m ? `${s}S` : ''}`;
}
