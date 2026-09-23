/**
 * R5-1 and R2-7: the status line must find the site's build, and must never
 * pass this editor's own off as it. Every host and environment string below is
 * one the QA runs actually observed.
 */
import { describe, expect, it } from 'vitest';
import { chooseDeployment, projectOf } from './deployments';
import type { DeploymentCandidate } from './deployments';

const EDITOR = 'https://shir-website-editor-7z3cjlqve-shiramitai1-3216s-projects.vercel.app';
const SITE_PREVIEW = 'https://shir-amitai-lq3sh9c5x-shiramitai1-3216s-projects.vercel.app';
const SITE_PRODUCTION = 'https://www.shir-amitai.com';

const at = (
  environment: string,
  url?: string,
  when = '2026-09-23T10:00:00Z',
): DeploymentCandidate => ({
  environment,
  createdAt: when,
  status: url ? { state: 'success', environmentUrl: url, createdAt: when } : null,
});

const SELF_HOST = 'admin.shir-amitai.com';

describe('the project name in the environment', () => {
  it('is what Vercel actually writes', () => {
    expect(projectOf('Preview – shir-amitai')).toBe('shir-amitai');
    expect(projectOf('Production – shir-website-editor')).toBe('shir-website-editor');
  });

  it('is empty when the environment names no project', () => {
    expect(projectOf('Production')).toBe('');
    expect(projectOf('Preview')).toBe('');
  });

  it('does not mistake a project whose name starts with the other', () => {
    expect(projectOf('Preview – shir-amitai-lq3sh9c5x')).not.toBe('shir-amitai');
  });
});

/**
 * The exact payload from run 5. The site built the preview, served the draft,
 * and the editor reported `unknown` - because `self` resolved to the site's
 * own project name and the hostname prefix rule swallowed it.
 */
describe('the run-5 regression', () => {
  const observed = [at('Preview – shir-amitai', SITE_PREVIEW)];

  it.each([
    ['nothing configured', {}],
    ['self correct', { self: 'shir-website-editor' }],
    ['site configured', { site: 'shir-amitai' }],
    ['both configured', { self: 'shir-website-editor', site: 'shir-amitai' }],
    ['self wrongly the site', { self: 'shir-amitai' }],
    ['self wrongly the site, site configured', { self: 'shir-amitai', site: 'shir-amitai' }],
  ])('finds the site with %s', (_name, who) => {
    const chosen = chooseDeployment(observed, { ...who, selfHost: SELF_HOST });
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PREVIEW);
  });
});

describe('with both projects present', () => {
  const both = [at('Preview – shir-website-editor', EDITOR), at('Preview – shir-amitai', SITE_PREVIEW)];

  it('takes the site even when the editor deployed first', () => {
    const chosen = chooseDeployment(both, { site: 'shir-amitai', selfHost: SELF_HOST });
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PREVIEW);
    expect(chosen.why).toBe('site');
  });

  it('excludes the editor by name when the site is not configured', () => {
    const chosen = chooseDeployment(both, { self: 'shir-website-editor', selfHost: SELF_HOST });
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PREVIEW);
    expect(chosen.why).toBe('not-ours');
  });

  it('recognises the site by its own domain in production', () => {
    const chosen = chooseDeployment(
      [at('Production – shir-website-editor', EDITOR), at('Production – shir-amitai', SITE_PRODUCTION)],
      { selfHost: SELF_HOST },
    );
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PRODUCTION);
  });

  it('excludes the editor by its own custom domain', () => {
    const chosen = chooseDeployment(
      [at('Production', 'https://admin.shir-amitai.com'), at('Production', SITE_PRODUCTION)],
      { selfHost: SELF_HOST },
    );
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PRODUCTION);
  });
});

describe('when only the editor deployed', () => {
  const only = [at('Preview – shir-website-editor', EDITOR)];

  it('says so rather than passing it off as the site', () => {
    const chosen = chooseDeployment(only, { self: 'shir-website-editor', site: 'shir-amitai', selfHost: SELF_HOST });
    expect(chosen.pick?.status?.environmentUrl).toBe(EDITOR);
    expect(chosen.why).toBe('only-candidate');
  });

  /**
   * The judgement call: an exclusion that removes every published deployment
   * is likelier to be wrong than a build is to be missing, and a confusing
   * link is a smaller failure than a preview that never renders at all.
   */
  it('prefers a doubtful answer to none, and marks it', () => {
    const chosen = chooseDeployment(only, { self: 'shir-website-editor', selfHost: SELF_HOST });
    expect(chosen.pick).not.toBeNull();
    expect(chosen.why).toBe('only-candidate');
  });
});

describe('a build that has not published a URL yet', () => {
  it('is reported as starting, not as an answer', () => {
    const chosen = chooseDeployment([at('Preview – shir-amitai')], { selfHost: SELF_HOST });
    expect(chosen.pick).toBeNull();
    expect(chosen.starting).toBe(true);
    expect(chosen.why).toBe('none');
  });

  it('does not count as starting when it is ours', () => {
    const chosen = chooseDeployment([at('Preview – shir-website-editor')], {
      self: 'shir-website-editor',
      selfHost: SELF_HOST,
    });
    expect(chosen.starting).toBe(false);
  });

  it('is ignored once something identifiable is present', () => {
    const chosen = chooseDeployment([at('Preview – shir-amitai'), at('Preview – shir-amitai', SITE_PREVIEW)], {
      site: 'shir-amitai',
      selfHost: SELF_HOST,
    });
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PREVIEW);
    expect(chosen.starting).toBe(false);
  });
});

describe('nothing at all', () => {
  it('answers with nothing', () => {
    expect(chooseDeployment([], { selfHost: SELF_HOST })).toEqual({
      pick: null,
      starting: false,
      why: 'none',
    });
  });
});
