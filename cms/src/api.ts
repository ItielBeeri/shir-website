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
  /** The published site's own address, when the deployment knows it. */
  siteUrl?: string;
}

/** Mirrors DeploymentStatus in api/_lib/github.ts. */
export interface DeployState {
  state: 'queued' | 'building' | 'ready' | 'failed' | 'none' | 'unknown';
  url?: string;
  startedAt?: string;
  updatedAt?: string;
  /** Diagnostic only - see DeploymentStatus in api/_lib/github.ts. */
  resolved?: {
    site?: string;
    self?: string;
    selfHost?: string;
    why: string;
    saw: string[];
  };
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
  'too-large': 'הקובץ גדול מדי בשביל האתר. אפשר לנסות תמונה קטנה יותר.',
  'legal-rejected': 'השינוי הזה בעמוד המשפטי אינו אפשרי.',
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
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
      status?: number;
    };
    // A rejected legal edit carries its own reason, written for the owner and
    // specific to what she changed; a generic sentence would tell her nothing.
    if (data.error === 'legal-rejected' && data.detail) {
      throw new FriendlyError(data.detail, false);
    }
    // A 403 from GitHub is the one upstream failure with a distinct cause the
    // owner can act on - by asking, not by retrying.
    const code = data.error === 'upstream' && data.status === 403 ? 'no-write-access' : data.error;
    throw new FriendlyError(friendly(code ?? 'upstream'), code !== 'too-large');
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

  /** `remove` rides along in the same commit, for an action that does both. */
  save: (
    message: string,
    files: Array<{ path: string; content: string; encoding?: 'utf-8' | 'base64' }>,
    remove: string[] = [],
  ) =>
    call<{ sha: string; pending: PathChange[] }>('save', {
      message,
      files: files.map((f) => ({ encoding: 'utf-8', ...f })),
      remove,
    }),

  pending: () => call<{ pending: PathChange[] }>('pending', {}),

  /** Paths the site has changed too since this draft was started. */
  conflicts: () => call<{ paths: string[] }>('conflicts', {}),

  list: (dir: string) =>
    call<{ files: string[] }>('list', undefined, `?dir=${encodeURIComponent(dir)}`),

  /** Starts the preview's build, unless the draft's commit already has one. */
  preview: () => call<{ sha: string; moved: boolean }>('preview', {}),

  refs: () => call<{ draft: string | null; target: string | null }>('refs', undefined, ''),

  status: (sha?: string) =>
    call<DeployState>('status', undefined, sha ? `?sha=${encodeURIComponent(sha)}` : ''),

  remove: (paths: string[], message: string) =>
    call<{ sha: string; pending: PathChange[] }>('delete', { paths, message }),

  discard: (path: string, message: string) =>
    call<{ sha: string; pending: PathChange[] }>('discard', { path, message }),

  publish: () => call<{ sha: string; paths: PathChange[] }>('publish', {}),

  history: () => call<{ commits: CommitInfo[] }>('history', {}),

  /** The paths one published commit touched, fetched when a row is opened. */
  commit: (sha: string) =>
    call<{ paths: PathChange[] }>('commit', undefined, `?sha=${encodeURIComponent(sha)}`),

  rename: (from: string, to: string, content: string, message: string) =>
    call<{ sha: string; pending: PathChange[] }>('rename', { from, to, content, message }),

  restore: (path: string, commitSha: string, message: string) =>
    call<{ sha: string; pending: PathChange[] }>('restore', { path, commitSha, message }),
};
