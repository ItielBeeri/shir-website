/**
 * An in-memory git, faithful enough to test the engine's semantics: content
 * addressing, trees, commits, refs and a real diff. Test-only.
 */
import { createHash } from 'node:crypto';
import type { CommitInfo, GitTransport, NewTreeEntry, PathChange } from './engine';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export class FakeGit implements GitTransport {
  private blobs = new Map<string, string>();
  private trees = new Map<string, Map<string, string>>();
  private commits = new Map<string, { treeSha: string; parents: string[]; message: string; date: string }>();
  private refs = new Map<string, string>();

  /** Set true to make the next updateRef fail, simulating a concurrent push. */
  failNextUpdate = false;
  readonly log: string[] = [];

  constructor(files: Record<string, string> = {}, branches = ['master']) {
    const tree = new Map<string, string>();
    for (const [path, content] of Object.entries(files)) {
      const sha = sha1(content);
      this.blobs.set(sha, content);
      tree.set(path, sha);
    }
    const treeSha = this.putTree(tree);
    const commit = this.putCommit('initial', treeSha, []);
    for (const b of branches) this.refs.set(b, commit);
  }

  private putTree(tree: Map<string, string>): string {
    const key = sha1(JSON.stringify([...tree.entries()].sort()));
    this.trees.set(key, new Map(tree));
    return key;
  }

  private putCommit(message: string, treeSha: string, parents: string[]): string {
    const sha = sha1(JSON.stringify([message, treeSha, parents, this.commits.size]));
    this.commits.set(sha, { treeSha, parents, message, date: new Date(2026, 0, 1 + this.commits.size).toISOString() });
    return sha;
  }

  private treeOf(commitSha: string): Map<string, string> {
    const commit = this.commits.get(commitSha);
    if (!commit) throw new Error(`no such commit ${commitSha}`);
    return this.trees.get(commit.treeSha)!;
  }

  async getRefSha(branch: string): Promise<string | null> {
    return this.refs.get(branch) ?? null;
  }

  async createRef(branch: string, sha: string): Promise<void> {
    if (this.refs.has(branch)) throw new Error(`ref exists: ${branch}`);
    this.refs.set(branch, sha);
    this.log.push(`createRef ${branch}`);
  }

  async updateRef(branch: string, sha: string, force: boolean): Promise<void> {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('not a fast-forward');
    }
    const current = this.refs.get(branch);
    if (!force && current && !this.isAncestor(current, sha)) {
      throw new Error('not a fast-forward');
    }
    this.refs.set(branch, sha);
    this.log.push(`updateRef ${branch}${force ? ' (force)' : ''}`);
  }

  private isAncestor(maybeAncestor: string, of: string): boolean {
    const seen = new Set<string>();
    const stack = [of];
    while (stack.length) {
      const sha = stack.pop()!;
      if (sha === maybeAncestor) return true;
      if (seen.has(sha)) continue;
      seen.add(sha);
      stack.push(...(this.commits.get(sha)?.parents ?? []));
    }
    return false;
  }

  async getCommitTree(sha: string): Promise<string> {
    const commit = this.commits.get(sha);
    if (!commit) throw new Error(`no such commit ${sha}`);
    return commit.treeSha;
  }

  async createBlob(content: string, encoding: 'utf-8' | 'base64'): Promise<string> {
    const stored = encoding === 'base64' ? `base64:${content}` : content;
    const sha = sha1(stored);
    this.blobs.set(sha, stored);
    return sha;
  }

  async createTree(baseTreeSha: string, entries: NewTreeEntry[]): Promise<string> {
    const tree = new Map(this.trees.get(baseTreeSha) ?? []);
    for (const entry of entries) {
      if (entry.sha === null) tree.delete(entry.path);
      else tree.set(entry.path, entry.sha);
    }
    return this.putTree(tree);
  }

  async createCommit(message: string, treeSha: string, parents: string[]): Promise<string> {
    return this.putCommit(message, treeSha, parents);
  }

  async getBlobSha(commitSha: string, path: string): Promise<string | null> {
    return this.treeOf(commitSha).get(path) ?? null;
  }

  async readFile(commitSha: string, path: string): Promise<string | null> {
    const sha = this.treeOf(commitSha).get(path);
    return sha ? (this.blobs.get(sha) ?? null) : null;
  }

  async mergeBase(aSha: string, bSha: string): Promise<string> {
    const ancestors = (sha: string): Set<string> => {
      const seen = new Set<string>();
      const stack = [sha];
      while (stack.length) {
        const s = stack.pop()!;
        if (seen.has(s)) continue;
        seen.add(s);
        stack.push(...(this.commits.get(s)?.parents ?? []));
      }
      return seen;
    };
    const ofA = ancestors(aSha);
    // Walk b newest-first and take the first commit a can also reach.
    const stack = [bSha];
    const seen = new Set<string>();
    while (stack.length) {
      const s = stack.shift()!;
      if (seen.has(s)) continue;
      seen.add(s);
      if (ofA.has(s)) return s;
      stack.push(...(this.commits.get(s)?.parents ?? []));
    }
    throw new Error('no merge base');
  }

  async compare(baseSha: string, headSha: string): Promise<PathChange[]> {
    const base = this.treeOf(baseSha);
    const head = this.treeOf(headSha);
    const out: PathChange[] = [];
    for (const [path, sha] of head) {
      if (!base.has(path)) out.push({ path, status: 'added' });
      else if (base.get(path) !== sha) out.push({ path, status: 'modified' });
    }
    for (const path of base.keys()) {
      if (!head.has(path)) out.push({ path, status: 'removed' });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async listCommits(branch: string, limit: number): Promise<CommitInfo[]> {
    const out: CommitInfo[] = [];
    let sha: string | undefined = this.refs.get(branch);
    while (sha && out.length < limit) {
      const commit = this.commits.get(sha)!;
      out.push({ sha, message: commit.message, date: commit.date, author: 'שיר' });
      sha = commit.parents[0];
    }
    return out;
  }

  // --- helpers for tests ---

  /** Snapshot of a branch's files, decoded. */
  filesOn(branch: string): Record<string, string> {
    const tree = this.treeOf(this.refs.get(branch)!);
    return Object.fromEntries([...tree].map(([p, sha]) => [p, this.blobs.get(sha)!]));
  }

  /** Commit directly to a branch, standing in for the images bot or a human. */
  async commitDirect(branch: string, files: Record<string, string | null>, message: string): Promise<string> {
    const head = this.refs.get(branch)!;
    const entries: NewTreeEntry[] = [];
    for (const [path, content] of Object.entries(files)) {
      entries.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: content === null ? null : await this.createBlob(content, 'utf-8'),
      });
    }
    const tree = await this.createTree(await this.getCommitTree(head), entries);
    const commit = await this.createCommit(message, tree, [head]);
    this.refs.set(branch, commit);
    return commit;
  }
}
