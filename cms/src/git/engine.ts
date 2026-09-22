/**
 * The write and publish engine.
 *
 * Everything here is a pure function over `GitTransport`, so the semantics
 * that matter - one commit per action, and a publish that touches only the
 * paths the draft changed - are testable without a network or a repository.
 *
 * Publish never swaps master's tree for the draft's. The images workflow
 * pushes derivative commits to `public/img/_opt/` on master while a draft is
 * open, and a whole-tree swap would revert them (AGENTS.md §13).
 */
import {
  DRAFT_BRANCH,
  TARGET_BRANCH,
  assertWritableBranch,
  assertWritablePath,
  assertWritablePaths,
} from './paths.js';

export type ChangeStatus = 'added' | 'modified' | 'removed';

export interface PathChange {
  path: string;
  status: ChangeStatus;
}

export interface NewTreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  /** null deletes the path. */
  sha: string | null;
}

export interface CommitInfo {
  sha: string;
  message: string;
  /** ISO 8601. */
  date: string;
  author: string;
}

export interface FileWrite {
  path: string;
  /** Text content, or base64 for a binary upload. */
  content: string;
  encoding: 'utf-8' | 'base64';
}

export interface GitTransport {
  getRefSha(branch: string): Promise<string | null>;
  createRef(branch: string, sha: string): Promise<void>;
  updateRef(branch: string, sha: string, force: boolean): Promise<void>;
  getCommitTree(sha: string): Promise<string>;
  createBlob(content: string, encoding: 'utf-8' | 'base64'): Promise<string>;
  createTree(baseTreeSha: string, entries: NewTreeEntry[]): Promise<string>;
  createCommit(message: string, treeSha: string, parents: string[]): Promise<string>;
  /** Blob sha of `path` at `commitSha`, or null when absent. */
  getBlobSha(commitSha: string, path: string): Promise<string | null>;
  readFile(commitSha: string, path: string): Promise<string | null>;
  /** Last commit common to both - GitHub's `merge_base_commit`. */
  mergeBase(aSha: string, bSha: string): Promise<string>;
  compare(baseSha: string, headSha: string): Promise<PathChange[]>;
  listCommits(branch: string, limit: number): Promise<CommitInfo[]>;
}

export type GitErrorKind = 'conflict' | 'missing' | 'rejected' | 'empty';

export class GitError extends Error {
  constructor(
    readonly kind: GitErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

const RETRIES = 3;

async function requireSha(t: GitTransport, branch: string): Promise<string> {
  const sha = await t.getRefSha(branch);
  if (!sha) throw new GitError('missing', `branch not found: ${branch}`);
  return sha;
}

/**
 * What the draft itself changed, measured from its merge base with master -
 * not from master's current tip.
 *
 * The distinction is the whole correctness of publish. A tree diff against the
 * tip also reports every path master gained since the draft diverged, as if the
 * draft had deleted them; applying that would revert the images bot's
 * derivative commits and any other work landed meanwhile.
 */
async function draftChanges(
  t: GitTransport,
): Promise<{ draft: string; master: string; base: string; changes: PathChange[] }> {
  const draft = await requireSha(t, DRAFT_BRANCH);
  const master = await requireSha(t, TARGET_BRANCH);
  const base = await t.mergeBase(master, draft);
  return { draft, master, base, changes: await t.compare(base, draft) };
}

export const PUBLISH_PREFIX = 'פרסום ממערכת הניהול: ';

/** Git's own guidance on subject length; Hebrew counts the same. */
const SUBJECT_LIMIT = 72;

/**
 * One commit on master, describing everything it carries.
 *
 * The saves are the record of what the owner actually did - "עדכון דף הבית",
 * "הוספת תמונה: …" - and collapsing them into a single generic line throws
 * that away at exactly the moment it becomes the permanent history.
 *
 * Repeats are folded: saving the same page four times is one thing done, not
 * four. Order is oldest first, the order she did them in.
 */
export function publishMessage(messages: readonly string[]): string {
  const unique = [...new Set(messages.map((m) => m.split('\n')[0].trim()).filter(Boolean))];
  if (unique.length === 0) return `${PUBLISH_PREFIX}עדכון תוכן`;

  const subject = `${PUBLISH_PREFIX}${unique.join(' · ')}`;
  if (subject.length <= SUBJECT_LIMIT) return subject;

  // Too long for one line: summarise, and keep every message in the body.
  const body = unique.map((m) => `- ${m}`).join('\n');
  return `${PUBLISH_PREFIX}${unique.length} שינויים\n\n${body}`;
}

/** Subjects of the draft's own commits, oldest first. */
async function draftMessages(t: GitTransport, base: string): Promise<string[]> {
  const commits = await t.listCommits(DRAFT_BRANCH, 100);
  const mine: string[] = [];
  for (const commit of commits) {
    if (commit.sha === base) break;
    mine.push(commit.message);
  }
  return mine.reverse();
}

/**
 * Start-of-session housekeeping: create the draft if absent, and fast-forward
 * it onto master when it holds nothing unpublished. Divergence then stays
 * minutes old rather than weeks, which is what keeps `publish` simple.
 */
export async function ensureDraft(t: GitTransport): Promise<{ created: boolean; movedTo?: string }> {
  const master = await requireSha(t, TARGET_BRANCH);
  const draft = await t.getRefSha(DRAFT_BRANCH);

  if (!draft) {
    await t.createRef(DRAFT_BRANCH, master);
    return { created: true };
  }
  if (draft === master) return { created: false };

  const base = await t.mergeBase(master, draft);
  const pending = await t.compare(base, draft);
  if (pending.length === 0) {
    // Behind master with nothing of its own: force is safe and is not a
    // discard, because there is nothing there to discard.
    await t.updateRef(DRAFT_BRANCH, master, true);
    return { created: false, movedTo: master };
  }
  return { created: false };
}

/** One commit, however many files the action touched. */
export async function saveFiles(
  t: GitTransport,
  options: { message: string; files: FileWrite[]; branch?: string },
): Promise<string> {
  const branch = options.branch ?? DRAFT_BRANCH;
  assertWritableBranch(branch);
  assertWritablePaths(options.files.map((f) => f.path));
  if (options.files.length === 0) throw new GitError('empty', 'nothing to save');

  const entries: NewTreeEntry[] = [];
  for (const file of options.files) {
    const sha = await t.createBlob(file.content, file.encoding);
    entries.push({ path: file.path, mode: '100644', type: 'blob', sha });
  }

  return commitOnto(t, branch, options.message, entries);
}

export async function deleteFiles(
  t: GitTransport,
  options: { message: string; paths: string[]; branch?: string },
): Promise<string> {
  const branch = options.branch ?? DRAFT_BRANCH;
  assertWritableBranch(branch);
  assertWritablePaths(options.paths);
  if (options.paths.length === 0) throw new GitError('empty', 'nothing to delete');

  return commitOnto(
    t,
    branch,
    options.message,
    options.paths.map((path) => ({ path, mode: '100644' as const, type: 'blob' as const, sha: null })),
  );
}

/**
 * The head sha is read immediately before the write and the whole commit is
 * rebuilt on a conflict, so a concurrent push - the images bot, or a second
 * tab - can never cause a lost update.
 */
async function commitOnto(
  t: GitTransport,
  branch: string,
  message: string,
  entries: NewTreeEntry[],
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const head = await requireSha(t, branch);
    const baseTree = await t.getCommitTree(head);
    const tree = await t.createTree(baseTree, entries);
    const commit = await t.createCommit(message, tree, [head]);
    try {
      await t.updateRef(branch, commit, false);
      return commit;
    } catch (error) {
      lastError = error;
    }
  }
  throw new GitError('conflict', `could not update ${branch} after ${RETRIES} attempts: ${lastError}`);
}

export interface PublishResult {
  sha: string;
  paths: PathChange[];
}

/**
 * Apply only the paths the draft changed onto master's current tree, then
 * fast-forward the draft onto the result.
 */
export async function publish(t: GitTransport): Promise<PublishResult> {
  const { draft, master, base, changes } = await draftChanges(t);
  if (changes.length === 0) throw new GitError('empty', 'nothing to publish');

  const message = publishMessage(await draftMessages(t, base));

  // A draft that somehow carries a change outside content is refused whole
  // rather than partially applied.
  assertWritablePaths(changes.map((c) => c.path));

  const entries: NewTreeEntry[] = [];
  for (const change of changes) {
    if (change.status === 'removed') {
      entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const sha = await t.getBlobSha(draft, change.path);
    if (!sha) throw new GitError('missing', `draft has no blob for ${change.path}`);
    entries.push({ path: change.path, mode: '100644', type: 'blob', sha });
  }

  const masterTree = await t.getCommitTree(master);
  const tree = await t.createTree(masterTree, entries);
  const commit = await t.createCommit(message, tree, [master]);
  await t.updateRef(TARGET_BRANCH, commit, false);
  await t.updateRef(DRAFT_BRANCH, commit, true);

  return { sha: commit, paths: changes };
}

/** What is waiting to be published, for the pending-changes tray. */
export async function pendingChanges(t: GitTransport): Promise<PathChange[]> {
  if (!(await t.getRefSha(DRAFT_BRANCH))) return [];
  return (await draftChanges(t)).changes;
}

/** Put one path back to master's content, leaving other pending edits alone. */
export async function discardPath(
  t: GitTransport,
  options: { path: string; message: string },
): Promise<string> {
  assertWritablePath(options.path);
  const master = await requireSha(t, TARGET_BRANCH);
  const sha = await t.getBlobSha(master, options.path);

  return commitOnto(t, DRAFT_BRANCH, options.message, [
    { path: options.path, mode: '100644', type: 'blob', sha },
  ]);
}

/** Restore one path to how it was at `commitSha`. */
export async function restorePath(
  t: GitTransport,
  options: { path: string; commitSha: string; message: string },
): Promise<string> {
  assertWritablePath(options.path);
  const sha = await t.getBlobSha(options.commitSha, options.path);
  if (!sha) throw new GitError('missing', `${options.path} did not exist at ${options.commitSha}`);

  return commitOnto(t, DRAFT_BRANCH, options.message, [
    { path: options.path, mode: '100644', type: 'blob', sha },
  ]);
}

export const history = (t: GitTransport, limit = 30): Promise<CommitInfo[]> =>
  t.listCommits(TARGET_BRANCH, limit);
