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
  PREVIEW_BRANCH,
  TARGET_BRANCH,
  assertMovableBranch,
  assertWritableBranch,
  assertWritablePath,
  assertWritablePaths,
} from './paths.js';
import { describePath } from '../model/describe.js';

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
 *
 * Measuring from the base does report one path too many, though: one master
 * has since caught up with on its own. Comparing the two blobs settles it, so
 * the owner is never shown a change that would change nothing.
 */
async function draftChanges(t: GitTransport): Promise<{
  draft: string;
  master: string;
  base: string;
  changes: PathChange[];
  /** The draft's blob for each changed path, already fetched. */
  blobs: Map<string, string | null>;
}> {
  const draft = await requireSha(t, DRAFT_BRANCH);
  const master = await requireSha(t, TARGET_BRANCH);
  const base = await t.mergeBase(master, draft);
  const measured = await t.compare(base, draft);

  const changes: PathChange[] = [];
  const blobs = new Map<string, string | null>();
  for (const change of measured) {
    const [mine, theirs] = await Promise.all([
      t.getBlobSha(draft, change.path),
      t.getBlobSha(master, change.path),
    ]);
    if (mine === theirs) continue;
    changes.push(change);
    blobs.set(change.path, mine);
  }
  return { draft, master, base, changes, blobs };
}

export const PUBLISH_PREFIX = 'פרסום ממערכת הניהול: ';

/** Git's own guidance on subject length; Hebrew counts the same. */
const SUBJECT_LIMIT = 72;

/**
 * One commit on master, describing everything it carries.
 *
 * The subject names what actually changed - the pages, not the actions. A
 * session of fourteen saves that added an image and then deleted it again
 * changed nothing about that image, and "14 שינויים" for three files counts
 * keystrokes rather than consequences.
 *
 * The saves stay in the body, because they are still the record of what she
 * did: "עדכון דף הבית", "הוספת תמונה: …" remain readable there without the
 * subject claiming more than happened.
 */
export function publishMessage(
  changes: readonly PathChange[],
  messages: readonly string[] = [],
): string {
  const names = [...new Set(changes.map(nameChange))];
  const log = [...new Set(messages.map((m) => m.split('\n')[0].trim()).filter(Boolean))];
  const body = log.length ? `\n\n${log.map((m) => `- ${m}`).join('\n')}` : '';

  if (names.length === 0) return `${PUBLISH_PREFIX}עדכון תוכן${body}`;

  const subject = `${PUBLISH_PREFIX}${names.join(' · ')}`;
  if (subject.length <= SUBJECT_LIMIT) return `${subject}${body}`;

  // Too long for one line: count them, and list them above the action log.
  const counted = names.length === 1 ? 'שינוי אחד' : `${names.length} שינויים`;
  const listed = names.map((n) => `- ${n}`).join('\n');
  return `${PUBLISH_PREFIX}${counted}\n\n${listed}${body}`;
}

/**
 * What happened to one path, in the words the subject line uses.
 *
 * A deletion read exactly like the addition of the same post, so the history
 * could not tell "wrote it" from "took it down" - and the history is the one
 * place she goes when something is missing from the site.
 */
const nameChange = (change: PathChange): string => {
  const name = describePath(change.path);
  if (change.status === 'removed') return `מחיקת ${name}`;
  if (change.status === 'added') return `הוספת ${name}`;
  return name;
};

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

/**
 * One commit, however many files the action touched - including the ones it
 * removes. Deleting an image is a write to the manifest and a removal of the
 * file, and as two commits a failure between them leaves the site with an
 * entry pointing at nothing, which fails the build.
 */
export async function saveFiles(
  t: GitTransport,
  options: { message: string; files: FileWrite[]; remove?: readonly string[]; branch?: string },
): Promise<string> {
  const branch = options.branch ?? DRAFT_BRANCH;
  const remove = options.remove ?? [];
  assertWritableBranch(branch);
  assertWritablePaths([...options.files.map((f) => f.path), ...remove]);
  if (options.files.length === 0 && remove.length === 0) {
    throw new GitError('empty', 'nothing to save');
  }

  const entries: NewTreeEntry[] = [];
  for (const file of options.files) {
    const sha = await t.createBlob(file.content, file.encoding);
    entries.push({ path: file.path, mode: '100644', type: 'blob', sha });
  }
  for (const path of remove) {
    entries.push({ path, mode: '100644', type: 'blob', sha: null });
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
 * Move a file, in one commit.
 *
 * Writing the new name and deleting the old as two commits leaves a moment
 * when the post exists at both addresses, and a failure between them leaves it
 * that way for good.
 */
export async function renameFile(
  t: GitTransport,
  options: { from: string; to: string; content: string; message: string; branch?: string },
): Promise<string> {
  const branch = options.branch ?? DRAFT_BRANCH;
  assertWritableBranch(branch);
  assertWritablePaths([options.from, options.to]);
  if (options.from === options.to) throw new GitError('empty', 'the name is unchanged');

  const sha = await t.createBlob(options.content, 'utf-8');
  return commitOnto(t, branch, options.message, [
    { path: options.to, mode: '100644', type: 'blob', sha },
    { path: options.from, mode: '100644', type: 'blob', sha: null },
  ]);
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
  const { master, base, changes, blobs } = await draftChanges(t);
  if (changes.length === 0) throw new GitError('empty', 'nothing to publish');

  const message = publishMessage(changes, await draftMessages(t, base));

  // A draft that somehow carries a change outside content is refused whole
  // rather than partially applied.
  assertWritablePaths(changes.map((c) => c.path));

  const entries: NewTreeEntry[] = [];
  for (const change of changes) {
    if (change.status === 'removed') {
      entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const sha = blobs.get(change.path) ?? null;
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

/**
 * Paths the draft changed that master has changed too since they parted.
 *
 * Publishing applies the draft's copy over master's for exactly these paths.
 * That is correct, and it is what "publish my work" means - but it is also the
 * one way the owner can undo somebody else's work without being told. The
 * draft stays open for as long as she has unpublished edits, so the window is
 * as long as her slowest piece of writing.
 *
 * Its own call rather than part of `pending`, because it costs two blob reads
 * per changed path and only one screen has any use for the answer.
 */
export async function conflictingPaths(t: GitTransport): Promise<string[]> {
  if (!(await t.getRefSha(DRAFT_BRANCH))) return [];
  const { master, base, changes } = await draftChanges(t);

  const out: string[] = [];
  for (const change of changes) {
    const [atBase, atMaster] = await Promise.all([
      t.getBlobSha(base, change.path),
      t.getBlobSha(master, change.path),
    ]);
    if (atBase !== atMaster) out.push(change.path);
  }
  return out;
}

/** What is waiting to be published, for the pending-changes tray. */
export async function pendingChanges(t: GitTransport): Promise<PathChange[]> {
  if (!(await t.getRefSha(DRAFT_BRANCH))) return [];
  return (await draftChanges(t)).changes;
}

/**
 * Point the preview branch at the draft's exact commit, so the build it
 * triggers is the draft's own and `status(draft)` finds it. Copying the
 * changes onto it as a new commit would give the build a sha nothing looks up.
 * Already there means already built, or building: no push, no build.
 */
export async function syncPreview(t: GitTransport): Promise<{ sha: string; moved: boolean }> {
  assertMovableBranch(PREVIEW_BRANCH);
  const draft = await requireSha(t, DRAFT_BRANCH);
  const preview = await t.getRefSha(PREVIEW_BRANCH);
  if (preview === draft) return { sha: draft, moved: false };

  // Forced: the draft is itself force-moved onto master, and the preview
  // branch holds nothing of its own to lose.
  if (preview) await t.updateRef(PREVIEW_BRANCH, draft, true);
  else await t.createRef(PREVIEW_BRANCH, draft);
  return { sha: draft, moved: true };
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
