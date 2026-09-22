/**
 * Client for the typed content API.
 *
 * Every failure becomes a Hebrew sentence here, once, so no screen has to
 * decide what an HTTP status means and no code or stack trace can reach the
 * owner (TEST-SPEC N-12 … N-14).
 */
import type { PathChange } from './git/engine';

export interface StartResult {
  draft: { created: boolean; movedTo?: string };
  pending: PathChange[];
  role: 'owner' | 'maintainer';
  login: string;
  /** "owner/repo" - the client needs it to build thumbnail URLs. */
  repo: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  author: string;
}

export class FriendlyError extends Error {
  constructor(
    message: string,
    readonly canRetry = true,
  ) {
    super(message);
    this.name = 'FriendlyError';
  }
}

const MESSAGES: Record<string, string> = {
  unauthenticated: 'צריך להתחבר מחדש.',
  'session-expired': 'ההתחברות פגה. אפשר להתחבר שוב - מה שכתבת נשמר.',
  'path-rejected': 'המערכת אינה רשאית לשנות את הקובץ הזה.',
  conflict: 'מישהו אחר שינה את אותו מקום באותו רגע. אפשר לנסות שוב.',
  empty: 'אין שינויים לפרסם.',
  missing: 'לא מצאתי את מה שביקשת. אולי זה כבר נמחק.',
  upstream: 'לא הצלחתי להגיע ל-GitHub כרגע.',
  offline: 'אין חיבור לאינטרנט.',
  misconfigured: 'המערכת עדיין לא הוגדרה במלואה.',
  'no-write-access': 'למערכת אין כרגע הרשאה לשמור שינויים באתר. זה משהו שאיתיאל צריך לאשר - שווה לפנות אליו.',
};

const friendly = (code: string): string => MESSAGES[code] ?? 'משהו השתבש. אפשר לנסות שוב.';

async function call<T>(action: string, body?: unknown, query = ''): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/content/${action}${query}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new FriendlyError(friendly('offline'));
  }

  if (response.status === 401) throw new FriendlyError(friendly('unauthenticated'), false);
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; status?: number };
    // A 403 from GitHub is the one upstream failure with a distinct cause the
    // owner can act on - by asking, not by retrying.
    const code = data.error === 'upstream' && data.status === 403 ? 'no-write-access' : data.error;
    throw new FriendlyError(friendly(code ?? 'upstream'));
  }
  return (await response.json()) as T;
}

export const api = {
  me: async (): Promise<{ signedIn: boolean; login?: string; role?: string }> => {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (response.status === 401) return { signedIn: false };
    return (await response.json()) as { signedIn: boolean; login?: string; role?: string };
  },

  start: () => call<StartResult>('start', {}),

  read: (path: string, ref?: string) =>
    call<{ path: string; content: string | null }>(
      'read',
      { path },
      ref ? `?ref=${encodeURIComponent(ref)}` : '',
    ),

  save: (message: string, files: Array<{ path: string; content: string; encoding?: 'utf-8' | 'base64' }>) =>
    call<{ sha: string; pending: PathChange[] }>('save', {
      message,
      files: files.map((f) => ({ encoding: 'utf-8', ...f })),
    }),

  pending: () => call<{ pending: PathChange[] }>('pending', {}),

  list: (dir: string) =>
    call<{ files: string[] }>('list', undefined, `?dir=${encodeURIComponent(dir)}`),

  refs: () => call<{ draft: string | null; target: string | null }>('refs', undefined, ''),

  status: (sha?: string) =>
    call<{ state: 'building' | 'ready' | 'failed' | 'unknown'; url?: string }>(
      'status',
      undefined,
      sha ? `?sha=${encodeURIComponent(sha)}` : '',
    ),

  remove: (paths: string[], message: string) =>
    call<{ sha: string; pending: PathChange[] }>('delete', { paths, message }),

  discard: (path: string, message: string) =>
    call<{ sha: string; pending: PathChange[] }>('discard', { path, message }),

  publish: (message: string) =>
    call<{ sha: string; paths: PathChange[] }>('publish', { message }),

  history: () => call<{ commits: CommitInfo[] }>('history', {}),

  restore: (path: string, commitSha: string, message: string) =>
    call<{ sha: string; pending: PathChange[] }>('restore', { path, commitSha, message }),
};
