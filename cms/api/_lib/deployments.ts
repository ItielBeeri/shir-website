/**
 * Which of a commit's deployments is the site's.
 *
 * Two Vercel projects build this repository, so one sha carries a deployment
 * from each and "the newest" is a coin toss. Getting it wrong shows the owner
 * *"התצוגה מוכנה"* next to a link to this editor instead of her site, and lets
 * the publish gate open on the wrong project's build.
 *
 * Neither of the obvious signals works on its own. GitHub's `environment` for
 * a Vercel deployment is `Production` or `Preview` - never a project name. And
 * the editor's own custom domain never appears in a deployment URL, because a
 * preview deploys to `<project>-<hash>-<scope>.vercel.app`.
 *
 * What does work is the project slug that begins that host. Vercel hands this
 * deployment its own slug at runtime, so the editor can always recognise
 * itself; naming the site's project as well turns recognition into a positive
 * match. Exclusion runs first, so it stays correct even when one slug is a
 * prefix of the other - `shir-website` and `shir-website-editor`.
 */
export interface DeploymentCandidate {
  environment: string;
  createdAt: string;
  /** Its latest status, or null when it has none yet. */
  status: { state: string; environmentUrl?: string; createdAt: string } | null;
}

export interface ProjectIdentity {
  /** The site's Vercel project slug, from SITE_VERCEL_PROJECT. */
  site?: string;
  /** This app's own slug, from Vercel's system environment. */
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

const slugOf = (url: string): string => hostOf(url).split('.')[0];

const belongsTo = (slug: string, project: string): boolean =>
  slug === project || slug.startsWith(`${project}-`);

/** Everything after the first label: admin.shir-amitai.com -> shir-amitai.com */
const parentDomain = (host: string): string => host.split('.').slice(1).join('.');

/**
 * A production deployment publishes to a custom domain, where no project slug
 * appears at all. The editor lives at `admin.` of the site's own domain
 * (AGENTS.md §13), so a custom host under that same domain, which is not the
 * editor's, is the site's.
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
}

/** `candidates` newest first, as GitHub returns them. */
export function chooseDeployment(
  candidates: readonly DeploymentCandidate[],
  who: ProjectIdentity,
): Chosen {
  const isOurs = (c: DeploymentCandidate): boolean => {
    const url = c.status?.environmentUrl;
    if (!url) return false;
    if (who.selfHost && hostOf(url) === who.selfHost) return true;
    return Boolean(who.self && belongsTo(slugOf(url), who.self));
  };

  const isTheSite = (c: DeploymentCandidate): boolean => {
    const url = c.status?.environmentUrl;
    if (url && onTheSitesDomain(url, who.selfHost)) return true;
    if (!who.site) return false;
    if (c.environment.includes(who.site)) return true;
    return Boolean(url && belongsTo(slugOf(url), who.site));
  };

  const others = candidates.filter((c) => !isOurs(c));
  // A deployment with no status has published no URL, so nothing about it can
  // be attributed yet. It still says that a build is under way.
  const starting = others.some((c) => !c.status?.environmentUrl);

  if (who.site) {
    const named = others.find(isTheSite);
    return { pick: named ?? null, starting: starting && !named };
  }

  // Without a name to match, the only thing known for certain is which
  // deployment is ours. Vagueness about the state is the safe failure; a
  // confident link to the wrong site is not.
  const identified = others.find((c) => c.status?.environmentUrl);
  return { pick: identified ?? null, starting: starting && !identified };
}
