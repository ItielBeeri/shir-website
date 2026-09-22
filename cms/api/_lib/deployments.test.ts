/**
 * R2-7: the status line must never report this editor's own build as the
 * site's. The hosts below are the real ones observed in the QA run.
 */
import { describe, expect, it } from 'vitest';
import { chooseDeployment } from './deployments';
import type { DeploymentCandidate } from './deployments';

const EDITOR = 'https://shir-website-editor-7z3cjlqve-shiramitai1-3216s-projects.vercel.app';
const SITE_PREVIEW = 'https://shir-amitai-mv1cmckdc-shiramitai1-3216s-projects.vercel.app';
const SITE_PRODUCTION = 'https://www.shir-amitai.com';

const at = (environment: string, url?: string, when = '2026-09-23T10:00:00Z'): DeploymentCandidate => ({
  environment,
  createdAt: when,
  status: url ? { state: 'success', environmentUrl: url, createdAt: when } : null,
});

const SELF = { self: 'shir-website-editor', selfHost: 'admin.shir-amitai.com' };

describe('with the site project named', () => {
  const who = { ...SELF, site: 'shir-amitai' };

  it('picks the site even when the editor deployed the same sha first', () => {
    const chosen = chooseDeployment([at('Preview', EDITOR), at('Preview', SITE_PREVIEW)], who);
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PREVIEW);
  });

  it('recognises the site by its own domain in production', () => {
    const chosen = chooseDeployment([at('Production', EDITOR), at('Production', SITE_PRODUCTION)], who);
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PRODUCTION);
  });

  it('reports nothing rather than the editor when only the editor deployed', () => {
    const chosen = chooseDeployment([at('Preview', EDITOR)], who);
    expect(chosen.pick).toBeNull();
    expect(chosen.starting).toBe(false);
  });
});

describe('without the site project named', () => {
  it('skips the editor and takes what is left', () => {
    const chosen = chooseDeployment([at('Preview', EDITOR), at('Preview', SITE_PREVIEW)], SELF);
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PREVIEW);
  });

  it('reports nothing when the only deployment is the editor', () => {
    expect(chooseDeployment([at('Preview', EDITOR)], SELF).pick).toBeNull();
  });

  it('skips the editor by its custom domain too', () => {
    const custom = at('Production', 'https://admin.shir-amitai.com');
    const chosen = chooseDeployment([custom, at('Production', SITE_PRODUCTION)], SELF);
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PRODUCTION);
  });
});

describe('when one project slug is a prefix of the other', () => {
  // The exclusion has to run before the match, or `shir-website-editor-…`
  // answers to a site project called `shir-website`.
  const who = { self: 'shir-website-editor', site: 'shir-website' };

  it('does not let the editor answer for the site', () => {
    const chosen = chooseDeployment(
      [at('Preview', EDITOR), at('Preview', 'https://shir-website-abc123-scope.vercel.app')],
      who,
    );
    expect(chosen.pick?.status?.environmentUrl).toBe('https://shir-website-abc123-scope.vercel.app');
  });

  it('reports nothing when only the editor is there', () => {
    expect(chooseDeployment([at('Preview', EDITOR)], who).pick).toBeNull();
  });
});

describe('a build that has not published a URL yet', () => {
  it('is reported as starting, not as an answer', () => {
    const chosen = chooseDeployment([at('Preview')], SELF);
    expect(chosen.pick).toBeNull();
    expect(chosen.starting).toBe(true);
  });

  it('is ignored once something identifiable is present', () => {
    const chosen = chooseDeployment([at('Preview'), at('Preview', SITE_PREVIEW)], {
      ...SELF,
      site: 'shir-amitai',
    });
    expect(chosen.pick?.status?.environmentUrl).toBe(SITE_PREVIEW);
    expect(chosen.starting).toBe(false);
  });

  it('is not claimed as ours on the strength of having no URL', () => {
    expect(chooseDeployment([at('Preview')], { ...SELF, site: 'shir-amitai' }).starting).toBe(true);
  });
});

describe('nothing at all', () => {
  it('answers with nothing', () => {
    expect(chooseDeployment([], SELF)).toEqual({ pick: null, starting: false });
  });
});
