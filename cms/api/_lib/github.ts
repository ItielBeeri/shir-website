/**
 * GitTransport over the GitHub REST API, plus the OAuth exchange.
 *
 * The engine runs here, on the server, rather than in the browser behind a
 * generic proxy. That is deliberate: a generic proxy would have to inspect
 * paths buried in tree payloads to enforce the write allowlist, whereas a
 * typed API means the client cannot express a call the allowlist has not
 * already seen.
 */
import type { CommitInfo, GitTransport, NewTreeEntry, PathChange } from '../../src/git/engine.js';

const API = 'https://api.github.com';

/** What the owner is waiting on after pressing publish. */
export interface DeploymentStatus {
  state: 'building' | 'ready' | 'failed' | 'unknown';
  url?: string;
}

const mapDeployState = (state: string): DeploymentStatus['state'] => {
  if (state === 'success') return 'ready';
  if (state === 'failure' || state === 'error') return 'failed';
  if (state === 'queued' || state === 'in_progress' || state === 'pending') return 'building';
  return 'unknown';
};

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface TokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

const now = () => Date.now();

async function oauth(params: Record<string, string>): Promise<TokenSet> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as Record<string, string | number>;
  if (!response.ok || typeof data.access_token !== 'string') {
    throw new GitHubError(response.status, String(data.error_description ?? 'token exchange failed'));
  }
  const expiresIn = Number(data.expires_in ?? 0);
  const refreshIn = Number(data.refresh_token_expires_in ?? 0);
  return {
    accessToken: data.access_token,
    // A non-expiring token reports no lifetime; treat it as a long one rather
    // than as already expired.
    expiresAt: now() + (expiresIn > 0 ? expiresIn : 8 * 3600) * 1000,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    refreshExpiresAt: refreshIn > 0 ? now() + refreshIn * 1000 : undefined,
  };
}

export const exchangeCode = (clientId: string, clientSecret: string, code: string, redirectUri: string) =>
  oauth({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri });

export const refreshTokens = (clientId: string, clientSecret: string, refreshToken: string) =>
  oauth({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

export async function viewer(token: string): Promise<{ login: string; name: string | null }> {
  const response = await fetch(`${API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new GitHubError(response.status, 'could not read the signed-in user');
  const data = (await response.json()) as { login: string; name: string | null };
  return { login: data.login, name: data.name };
}

export class GitHubTransport implements GitTransport {
  constructor(
    private readonly token: string,
    private readonly repo: string,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API}/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 404) return null as T;
    if (!response.ok) {
      const body = await response.text();
      throw new GitHubError(response.status, body.slice(0, 500));
    }
    if (response.status === 204) return null as T;
    return (await response.json()) as T;
  }

  async getRefSha(branch: string): Promise<string | null> {
    const ref = await this.call<{ object: { sha: string } } | null>(
      `/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return ref?.object.sha ?? null;
  }

  async createRef(branch: string, sha: string): Promise<void> {
    await this.call('/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });
  }

  async updateRef(branch: string, sha: string, force: boolean): Promise<void> {
    await this.call(`/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha, force }),
    });
  }

  async getCommitTree(sha: string): Promise<string> {
    const commit = await this.call<{ tree: { sha: string } }>(`/git/commits/${sha}`);
    return commit.tree.sha;
  }

  async createBlob(content: string, encoding: 'utf-8' | 'base64'): Promise<string> {
    const blob = await this.call<{ sha: string }>('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content, encoding }),
    });
    return blob.sha;
  }

  async createTree(baseTreeSha: string, entries: NewTreeEntry[]): Promise<string> {
    const tree = await this.call<{ sha: string }>('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
    });
    return tree.sha;
  }

  async createCommit(message: string, treeSha: string, parents: string[]): Promise<string> {
    const commit = await this.call<{ sha: string }>('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: treeSha, parents }),
    });
    return commit.sha;
  }

  async getBlobSha(commitSha: string, path: string): Promise<string | null> {
    const entry = await this.call<{ sha: string } | null>(
      `/contents/${encodePath(path)}?ref=${commitSha}`,
    );
    return entry?.sha ?? null;
  }

  async readFile(commitSha: string, path: string): Promise<string | null> {
    const entry = await this.call<{ content?: string; encoding?: string } | null>(
      `/contents/${encodePath(path)}?ref=${commitSha}`,
    );
    if (!entry?.content) return null;
    return Buffer.from(entry.content, (entry.encoding as BufferEncoding) ?? 'base64').toString('utf8');
  }

  /** File names directly under a directory at a commit. */
  async listDir(commitSha: string, dir: string): Promise<string[]> {
    const entries = await this.call<Array<{ name: string; type: string }> | null>(
      `/contents/${encodePath(dir)}?ref=${commitSha}`,
    );
    return (entries ?? []).filter((e) => e.type === 'file').map((e) => e.name);
  }

  async mergeBase(aSha: string, bSha: string): Promise<string> {
    const cmp = await this.call<{ merge_base_commit: { sha: string } }>(
      `/compare/${aSha}...${bSha}`,
    );
    return cmp.merge_base_commit.sha;
  }

  async compare(baseSha: string, headSha: string): Promise<PathChange[]> {
    const out: PathChange[] = [];
    let page = 1;
    // The compare endpoint pages its file list; a large image commit can spill.
    for (;;) {
      const cmp = await this.call<{ files?: Array<{ filename: string; status: string }> }>(
        `/compare/${baseSha}...${headSha}?per_page=100&page=${page}`,
      );
      const files = cmp.files ?? [];
      for (const file of files) out.push({ path: file.filename, status: mapStatus(file.status) });
      if (files.length < 100) break;
      page += 1;
    }
    return out;
  }

  /**
   * What the host reports about a commit, read from GitHub's deployment
   * statuses rather than from Vercel's own API.
   *
   * Vercel pushes these to the repo already, so this reuses the session token
   * against one repository. A Vercel API token would work too, but Vercel has
   * no read-only tokens: the smallest one available can delete projects and
   * read every environment variable in the account, to render a status line.
   *
   * Needs `Deployments: read-only` on the App. Without it this returns
   * `unknown` and the caller simply shows no status, which is why nothing here
   * throws.
   */
  async deploymentStatus(sha: string): Promise<DeploymentStatus> {
    try {
      const deployments = await this.call<Array<{ id: number; environment: string }> | null>(
        `/deployments?sha=${encodeURIComponent(sha)}&per_page=20`,
      );
      if (!deployments?.length) return { state: 'unknown' };

      // Newest first; production is what "did it go up?" means.
      const production =
        deployments.find((d) => /prod/i.test(d.environment)) ?? deployments[0];

      const statuses = await this.call<Array<{
        state: string;
        environment_url?: string;
      }> | null>(`/deployments/${production.id}/statuses?per_page=1`);

      const latest = statuses?.[0];
      if (!latest) return { state: 'building' };
      return { state: mapDeployState(latest.state), url: latest.environment_url };
    } catch {
      return { state: 'unknown' };
    }
  }

  async listCommits(branch: string, limit: number): Promise<CommitInfo[]> {
    const commits = await this.call<
      Array<{ sha: string; commit: { message: string; author: { name: string; date: string } } }>
    >(`/commits?sha=${encodeURIComponent(branch)}&per_page=${Math.min(limit, 100)}`);
    return (commits ?? []).map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.author.date,
      author: c.commit.author.name,
    }));
  }
}

const mapStatus = (status: string): PathChange['status'] =>
  status === 'added' ? 'added' : status === 'removed' ? 'removed' : 'modified';

/** Keeps the Hebrew filenames of blog posts intact through the REST path. */
const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');
