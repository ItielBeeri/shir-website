/**
 * Configuration, all of it from Vercel's encrypted environment. Nothing here
 * has a default that would work in production by accident: a missing variable
 * fails the request loudly rather than falling back to something insecure.
 */
export interface Config {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  /** "owner/repo". */
  repo: string;
  /** GitHub logins allowed to sign in at all. */
  allowedLogins: string[];
  /** Subset of the above that may edit locked legal fields. */
  maintainerLogins: string[];
  /**
   * The site's Vercel project name. Optional, and only for telling the two
   * projects' deployments of one commit apart; without it the status line
   * falls back to skipping this editor's own deployment.
   */
  siteProject?: string;
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable: ${name}`);
  return value;
};

const list = (name: string): string[] =>
  (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function config(): Config {
  const allowedLogins = list('ALLOWED_GITHUB_LOGINS');
  if (allowedLogins.length === 0) {
    throw new Error('ALLOWED_GITHUB_LOGINS is empty - nobody could sign in');
  }
  return {
    clientId: required('GITHUB_APP_CLIENT_ID'),
    clientSecret: required('GITHUB_APP_CLIENT_SECRET'),
    sessionSecret: required('SESSION_SECRET'),
    repo: required('TARGET_REPO'),
    allowedLogins,
    maintainerLogins: list('MAINTAINER_GITHUB_LOGINS'),
    siteProject: process.env.SITE_VERCEL_PROJECT || undefined,
  };
}

export type Role = 'owner' | 'maintainer';

export const roleFor = (login: string, cfg: Config): Role =>
  cfg.maintainerLogins.includes(login.toLowerCase()) ? 'maintainer' : 'owner';

/**
 * This deployment's own Vercel project slug.
 *
 * `VERCEL_BRANCH_URL` is `<project>-git-<branch>-<scope>.vercel.app`, so the
 * slug is everything before `-git-`. It is how the editor recognises its own
 * deployments among a commit's, which is what stops it reporting its own build
 * as the site's.
 */
export function selfProject(): string | undefined {
  const label = (process.env.VERCEL_BRANCH_URL ?? '').split('.')[0];
  const at = label.indexOf('-git-');
  if (at > 0) return label.slice(0, at);
  return process.env.VERCEL_PROJECT_NAME || undefined;
}

/** The origin this deployment is reachable at, for the OAuth redirect. */
export function selfOrigin(host: string | undefined): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  if (!host) throw new Error('cannot determine origin');
  return `https://${host}`;
}
