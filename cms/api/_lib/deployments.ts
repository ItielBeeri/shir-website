/**
 * Which of a commit's deployments is the site's.
 *
 * Two Vercel projects build this repository, so one sha carries a deployment
 * from each. Getting it wrong either shows the owner a link to this editor
 * instead of her site, or - worse - discards her site's build and leaves the
 * preview permanently blank.
 *
 * GitHub names the project in the deployment's `environment`: Vercel writes
 * `Preview – shir-amitai`, not a bare `Preview`. That is the signal used here,
 * matched **exactly** after stripping the environment word. An earlier version
 * matched the project name as a prefix of the deployment's hostname, which is
 * how `shir-amitai` came to swallow `shir-amitai-lq3sh9c5x-…` - the site's own
 * build, discarded as though it were ours.
 *
 * Two rules keep a misconfiguration from costing the owner her preview:
 * recognising the site wins over recognising ourselves, and an exclusion that
 * removes *everything* is treated as wrong rather than as an answer.
 */
export interface DeploymentCandidate {
  environment: string;
  createdAt: string;
  /** Its latest status, or null when it has none yet. */
  status: { state: string; environmentUrl?: string; createdAt: string } | null;
}

export interface ProjectIdentity {
  /** The site's Vercel project, from SITE_VERCEL_PROJECT. */
  site?: string;
  /** This app's own, from Vercel's system environment. */
  self?: string;
  /** This app's own request host, e.g. admin.shir-amitai.com. */
  selfHost?: string;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** `Preview – shir-amitai` → `shir-amitai`; a bare `Production` → ''. */
export const projectOf = (environment: string): string =>
  environment.replace(/^\s*(production|preview)\b\s*[–—:-]?\s*/i, '').trim();

/** Everything after the first label: admin.shir-amitai.com → shir-amitai.com */
const parentDomain = (host: string): string => host.split('.').slice(1).join('.');

/**
 * A deployment published to a custom domain, where no project name appears at
 * all. The editor lives at `admin.` of the site's own domain (AGENTS.md §13),
 * so a custom host under that domain which is not the editor's is the site's.
 *
 * GitHub carries the deployment's own URL rather than the alias Vercel gives
 * it, so this is a fallback for a shape the integration may report and not the
 * production path; `who.site` is what names production.
 */
function onTheSitesDomain(url: string, selfHost: string | undefined): boolean {
  if (!selfHost) return false;
  const host = hostOf(url);
  if (!host || host === selfHost) return false;
  const home = parentDomain(selfHost);
  // A `*.vercel.app` host shares that parent with everything; it says nothing.
  if (!home.includes('.') || home.endsWith('vercel.app')) return false;
  return host === home || host.endsWith(`.${home}`);
}

export interface Chosen {
  pick: DeploymentCandidate | null;
  /** Something that is not ours has started but cannot be named yet. */
  starting: boolean;
  /** How the pick was reached, for a status response that can be diagnosed. */
  why: 'site' | 'not-ours' | 'only-candidate' | 'none';
}

/** `candidates` newest first, as GitHub returns them. */
export function chooseDeployment(
  candidates: readonly DeploymentCandidate[],
  who: ProjectIdentity,
): Chosen {
  const isOurs = (c: DeploymentCandidate): boolean => {
    if (who.self && projectOf(c.environment) === who.self) return true;
    const url = c.status?.environmentUrl;
    return Boolean(url && who.selfHost && hostOf(url) === who.selfHost);
  };

  const isTheSite = (c: DeploymentCandidate): boolean => {
    if (who.site && projectOf(c.environment) === who.site) return true;
    const url = c.status?.environmentUrl;
    return Boolean(url && onTheSitesDomain(url, who.selfHost));
  };

  const published = candidates.filter((c) => c.status?.environmentUrl);
  // A deployment with no status has published no URL, so nothing about it can
  // be attributed yet. It still says that a build is under way.
  const starting = candidates.some((c) => !c.status?.environmentUrl && !isOurs(c));

  // Recognising the site is stronger evidence than recognising ourselves, and
  // it is checked first so a wrong `self` cannot hide her own build.
  const site = published.find(isTheSite);
  if (site) return { pick: site, starting: false, why: 'site' };

  const notOurs = published.find((c) => !isOurs(c));
  if (notOurs) return { pick: notOurs, starting: false, why: 'not-ours' };

  // Everything was excluded as ours. Some build published a URL for this
  // commit, so the exclusion is likelier to be wrong than the deployment is to
  // be absent - and a wrong link is a smaller failure than no preview at all.
  if (published.length > 0) {
    return { pick: published[0], starting: false, why: 'only-candidate' };
  }

  return { pick: null, starting, why: 'none' };
}
