/**
 * Every content operation, as a typed action. The engine and its write
 * allowlist run here; the client cannot name a path this file has not already
 * passed through `assertWritablePath`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config, selfOrigin } from '../_lib/env.js';
import { GitHubTransport, refreshTokens } from '../_lib/github.js';
import {
  SESSION_COOKIE,
  cookie,
  needsRefresh,
  parseCookies,
  seal,
  unseal,
} from '../_lib/session.js';
import type { Session } from '../_lib/session.js';
import {
  deleteFiles,
  discardPath,
  ensureDraft,
  history,
  pendingChanges,
  publish,
  renameFile,
  restorePath,
  saveFiles,
} from '../../src/git/engine.js';
import {
  DRAFT_BRANCH,
  TARGET_BRANCH,
  assertReadablePath,
  assertWritablePath,
} from '../../src/git/paths.js';
import { isLegalFile, legalProblems } from '../../src/model/legal.js';
import type { Role } from '../../src/model/legal.js';

/**
 * A request that is wrong in itself, as opposed to one GitHub refused. The
 * distinction reaches the owner: an oversized image told her GitHub was
 * unreachable, which is neither true nor something she can act on.
 */
class InvalidRequest extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'InvalidRequest';
  }
}

const SESSION_DAYS = 180;
/** Base64 of 8 MB, plus slack. Vercel caps the body well below this anyway. */
const MAX_CONTENT = 12_000_000;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cfg = config();
  const cookies = parseCookies(req.headers.cookie);
  let session = unseal<Session>(cookies[SESSION_COOKIE] ?? '', cfg.sessionSecret);
  if (!session) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  // Silent refresh, so an 8-hour token never surfaces as a login screen.
  if (needsRefresh(session) && session.refreshToken) {
    try {
      const tokens = await refreshTokens(cfg.clientId, cfg.clientSecret, session.refreshToken);
      session = { ...session, ...tokens };
      res.setHeader(
        'Set-Cookie',
        cookie(SESSION_COOKIE, seal(session, cfg.sessionSecret), {
          maxAge: SESSION_DAYS * 24 * 3600,
        }),
      );
    } catch {
      res.status(401).json({ error: 'session-expired' });
      return;
    }
  }

  const git = new GitHubTransport(session.accessToken, cfg.repo);
  const action = String(req.query.action ?? '');
  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    switch (action) {
      case 'start': {
        const draft = await ensureDraft(git);
        const pending = await pendingChanges(git);
        res.status(200).json({
          draft,
          pending,
          role: session.role,
          login: session.login,
          repo: cfg.repo,
        });
        return;
      }

      case 'read': {
        const path = String(body.path ?? req.query.path ?? '');
        assertReadablePath(path);
        const ref = String(req.query.ref ?? DRAFT_BRANCH);
        const sha = await git.getRefSha(ref);
        if (!sha) {
          res.status(404).json({ error: 'no-such-ref' });
          return;
        }
        res.status(200).json({ path, content: await git.readFile(sha, path) });
        return;
      }

      case 'list': {
        const dir = String(req.query.dir ?? '');
        assertWritablePath(`${dir.replace(/\/$/, '')}/probe.mdx`);
        const sha = await git.getRefSha(DRAFT_BRANCH);
        res.status(200).json({ files: sha ? await git.listDir(sha, dir) : [] });
        return;
      }

      case 'save': {
        const remove = Array.isArray(body.remove) ? (body.remove as string[]).map(String) : [];
        const files = asFiles(body.files, remove.length > 0);
        const message = String(body.message ?? 'עריכת תוכן');
        if (remove.some(isLegalFile)) {
          throw new InvalidRequest('legal-rejected', 'אי אפשר למחוק עמוד משפטי.');
        }
        await assertLegal(git, files, session.role);
        const sha = await saveFiles(git, { message, files, remove });
        res.status(200).json({ sha, pending: await pendingChanges(git) });
        return;
      }

      case 'delete': {
        const paths = (body.paths as string[]) ?? [];
        // The three legal documents are required to exist (תקנה 35, and the
        // privacy duty in §12); nothing in the UI deletes one.
        if (paths.some(isLegalFile)) {
          throw new InvalidRequest('legal-rejected', 'אי אפשר למחוק עמוד משפטי.');
        }
        const sha = await deleteFiles(git, { message: String(body.message ?? 'מחיקה'), paths });
        res.status(200).json({ sha, pending: await pendingChanges(git) });
        return;
      }

      case 'rename': {
        const from = String(body.from ?? '');
        const to = String(body.to ?? '');
        if (isLegalFile(from) || isLegalFile(to)) {
          throw new InvalidRequest('legal-rejected', 'אי אפשר לשנות את הכתובת של עמוד משפטי.');
        }
        const sha = await renameFile(git, {
          from,
          to,
          content: String(body.content ?? ''),
          message: String(body.message ?? 'שינוי כתובת'),
        });
        res.status(200).json({ sha, pending: await pendingChanges(git) });
        return;
      }

      case 'commit': {
        const sha = String(req.query.sha ?? '');
        res.status(200).json({ paths: sha ? await git.commitPaths(sha) : [] });
        return;
      }

      case 'pending': {
        res.status(200).json({ pending: await pendingChanges(git) });
        return;
      }

      case 'discard': {
        const sha = await discardPath(git, {
          path: String(body.path ?? ''),
          message: String(body.message ?? 'ביטול שינוי'),
        });
        res.status(200).json({ sha, pending: await pendingChanges(git) });
        return;
      }

      case 'publish': {
        // The message is composed from the draft's own commits, server-side.
        const result = await publish(git);
        res.status(200).json(result);
        return;
      }

      case 'history': {
        res.status(200).json({ commits: await history(git, 30) });
        return;
      }

      case 'restore': {
        const sha = await restorePath(git, {
          path: String(body.path ?? ''),
          commitSha: String(body.commitSha ?? ''),
          message: String(body.message ?? 'שחזור גרסה'),
        });
        res.status(200).json({ sha, pending: await pendingChanges(git) });
        return;
      }

      case 'status': {
        const sha = String(req.query.sha ?? (await git.getRefSha(TARGET_BRANCH)) ?? '');
        if (!sha) {
          res.status(200).json({ state: 'unknown' });
          return;
        }
        let selfHost: string | undefined;
        try {
          selfHost = new URL(selfOrigin(req.headers.host)).host;
        } catch {
          selfHost = undefined;
        }
        res.status(200).json(
          await git.deploymentStatus(sha, { project: cfg.siteProject, selfHost }),
        );
        return;
      }

      case 'refs': {
        res.status(200).json({
          draft: await git.getRefSha(DRAFT_BRANCH),
          target: await git.getRefSha(TARGET_BRANCH),
        });
        return;
      }

      default:
        res.status(404).json({ error: 'unknown action' });
    }
  } catch (error) {
    const err = error as Error & { kind?: string; status?: number };
    // The owner gets a Hebrew sentence, never API text - but the real cause has
    // to reach the Vercel log, or a 502 here is undiagnosable from the outside.
    console.error('[content]', action, err.name, err.status ?? '', err.message);

    if (err.name === 'InvalidRequest') {
      const bad = err as unknown as InvalidRequest;
      res.status(400).json({ error: bad.code, detail: bad.detail });
      return;
    }
    if (err.name === 'PathRejected') {
      res.status(403).json({ error: 'path-rejected', detail: err.message });
      return;
    }
    if (err.name === 'GitError') {
      res.status(409).json({ error: err.kind ?? 'conflict' });
      return;
    }
    // The upstream status is not sensitive and is the one thing that makes a
    // failure actionable: 403 means the installation lacks write access.
    res.status(502).json({ error: 'upstream', status: err.status });
  }
}

interface IncomingFile {
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
}

function asFiles(value: unknown, mayBeEmpty = false): IncomingFile[] {
  if (!Array.isArray(value)) throw new InvalidRequest('empty');
  if (value.length === 0 && !mayBeEmpty) throw new InvalidRequest('empty');
  return value.map((raw) => {
    const file = raw as Record<string, unknown>;
    const path = String(file.path ?? '');
    const content = String(file.content ?? '');
    const encoding = file.encoding === 'base64' ? 'base64' : 'utf-8';
    if (content.length > MAX_CONTENT) throw new InvalidRequest('too-large');
    assertWritablePath(path);
    return { path, content, encoding };
  });
}

/**
 * The legal rules, run on the bytes rather than on the form that produced
 * them. `locks.ts` in the client is an explanation; this is the rule.
 */
async function assertLegal(
  git: GitHubTransport,
  files: IncomingFile[],
  role: Role,
): Promise<void> {
  const legal = files.filter((f) => isLegalFile(f.path) && f.encoding === 'utf-8');
  if (legal.length === 0) return;

  const head = await git.getRefSha(DRAFT_BRANCH);
  for (const file of legal) {
    const before = (head ? await git.readFile(head, file.path) : null) ?? '';
    const problems = legalProblems(file.path, before, file.content, role);
    if (problems.length > 0) throw new InvalidRequest('legal-rejected', problems[0].reason);
  }
}
