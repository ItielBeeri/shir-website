/** Gates G-1 … G-12 from TEST-SPEC.md, against the in-memory git. */
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGit } from './fake-git';
import {
  deleteFiles,
  discardPath,
  ensureDraft,
  history,
  pendingChanges,
  publish,
  publishMessage,
  restorePath,
  saveFiles,
} from './engine';
import { DRAFT_BRANCH, TARGET_BRANCH } from './paths';

const SEED = {
  'src/content/site.toml': '[brand]\nname = "שיר אמיתי"\n',
  'src/content/pages/home.toml': '[hero]\ntitle = "שיר"\n',
  'src/content/images.toml': '[a]\nfile = "/img/content/a.jpg"\nalt = "א"\n',
  'public/img/_opt/manifest.json': '{"v":1}',
  'src/pages/index.astro': '<html></html>',
};

let git: FakeGit;

beforeEach(async () => {
  git = new FakeGit(SEED);
  await ensureDraft(git);
});

describe('ensureDraft', () => {
  it('G-8 creates the draft from master when absent', async () => {
    const fresh = new FakeGit(SEED);
    const result = await ensureDraft(fresh);
    expect(result.created).toBe(true);
    expect(await fresh.getRefSha(DRAFT_BRANCH)).toBe(await fresh.getRefSha(TARGET_BRANCH));
  });

  it('fast-forwards a draft that holds nothing unpublished', async () => {
    await git.commitDirect(TARGET_BRANCH, { 'src/content/site.toml': 'changed' }, 'direct');
    const result = await ensureDraft(git);
    expect(result.movedTo).toBe(await git.getRefSha(TARGET_BRANCH));
  });

  it('leaves a draft that has unpublished work alone', async () => {
    await saveFiles(git, {
      message: 'edit',
      files: [{ path: 'src/content/site.toml', content: 'mine', encoding: 'utf-8' }],
    });
    const before = await git.getRefSha(DRAFT_BRANCH);
    await git.commitDirect(TARGET_BRANCH, { 'src/content/images.toml': 'bot' }, 'bot');
    const result = await ensureDraft(git);
    expect(result.movedTo).toBeUndefined();
    expect(await git.getRefSha(DRAFT_BRANCH)).toBe(before);
  });
});

describe('saveFiles', () => {
  it('G-1 makes exactly one commit for one action', async () => {
    const before = await history(git, 50);
    await saveFiles(git, {
      message: 'שינוי טקסט בדף הבית',
      files: [{ path: 'src/content/pages/home.toml', content: 'x', encoding: 'utf-8' }],
    });
    const commits = await git.listCommits(DRAFT_BRANCH, 50);
    expect(commits.length).toBe(before.length + 1);
    expect(commits[0].message).toBe('שינוי טקסט בדף הבית');
  });

  it('G-2 commits a binary and its manifest entry together', async () => {
    await saveFiles(git, {
      message: 'הוספת תמונה',
      files: [
        { path: 'public/img/content/new.jpg', content: 'AAAA', encoding: 'base64' },
        { path: 'src/content/images.toml', content: '[a]\n[new]\n', encoding: 'utf-8' },
      ],
    });
    const commits = await git.listCommits(DRAFT_BRANCH, 5);
    expect(commits[0].message).toBe('הוספת תמונה');
    const files = git.filesOn(DRAFT_BRANCH);
    expect(files['public/img/content/new.jpg']).toBe('base64:AAAA');
    expect(files['src/content/images.toml']).toContain('[new]');
    // One commit, not two.
    expect(commits[1].message).toBe('initial');
  });

  it('refuses a path outside content', async () => {
    await expect(
      saveFiles(git, {
        message: 'x',
        files: [{ path: 'src/pages/index.astro', content: 'x', encoding: 'utf-8' }],
      }),
    ).rejects.toThrow(/refusing to write/);
  });

  it('refuses the generated derivative tree', async () => {
    await expect(
      saveFiles(git, {
        message: 'x',
        files: [{ path: 'public/img/_opt/manifest.json', content: '{}', encoding: 'utf-8' }],
      }),
    ).rejects.toThrow(/images workflow/);
  });

  it('G-7 rebuilds and retries when the ref moved under it', async () => {
    git.failNextUpdate = true;
    const sha = await saveFiles(git, {
      message: 'retried',
      files: [{ path: 'src/content/site.toml', content: 'after retry', encoding: 'utf-8' }],
    });
    expect(sha).toBeTruthy();
    expect(git.filesOn(DRAFT_BRANCH)['src/content/site.toml']).toBe('after retry');
  });

  it('G-9 lands two sequential saves without losing either', async () => {
    await saveFiles(git, {
      message: 'one',
      files: [{ path: 'src/content/site.toml', content: 'one', encoding: 'utf-8' }],
    });
    await saveFiles(git, {
      message: 'two',
      files: [{ path: 'src/content/pages/home.toml', content: 'two', encoding: 'utf-8' }],
    });
    const files = git.filesOn(DRAFT_BRANCH);
    expect(files['src/content/site.toml']).toBe('one');
    expect(files['src/content/pages/home.toml']).toBe('two');
  });
});

describe('publish', () => {
  it('G-4 applies only the paths the draft changed', async () => {
    await saveFiles(git, {
      message: 'edit home',
      files: [{ path: 'src/content/pages/home.toml', content: 'edited', encoding: 'utf-8' }],
    });
    const result = await publish(git);
    expect(result.paths.map((p) => p.path)).toEqual(['src/content/pages/home.toml']);

    const files = git.filesOn(TARGET_BRANCH);
    expect(files['src/content/pages/home.toml']).toBe('edited');
    expect(files['src/content/site.toml']).toBe(SEED['src/content/site.toml']);
    expect(files['src/pages/index.astro']).toBe(SEED['src/pages/index.astro']);
  });

  it('G-5 preserves a derivative commit the bot pushed mid-session', async () => {
    await saveFiles(git, {
      message: 'edit home',
      files: [{ path: 'src/content/pages/home.toml', content: 'edited', encoding: 'utf-8' }],
    });
    // The images workflow lands on master while the draft is open.
    await git.commitDirect(
      TARGET_BRANCH,
      { 'public/img/_opt/manifest.json': '{"v":2}', 'public/img/_opt/a-900.abc.avif': 'AVIF' },
      'chore: rebuild image derivatives',
    );

    await publish(git);
    const files = git.filesOn(TARGET_BRANCH);
    expect(files['public/img/_opt/manifest.json']).toBe('{"v":2}');
    expect(files['public/img/_opt/a-900.abc.avif']).toBe('AVIF');
    expect(files['src/content/pages/home.toml']).toBe('edited');
  });

  it('G-6 keeps an unrelated master commit made mid-session', async () => {
    await saveFiles(git, {
      message: 'edit home',
      files: [{ path: 'src/content/pages/home.toml', content: 'edited', encoding: 'utf-8' }],
    });
    await git.commitDirect(TARGET_BRANCH, { 'src/lib/new.ts': 'export {}' }, 'dev work');

    await publish(git);
    const files = git.filesOn(TARGET_BRANCH);
    expect(files['src/lib/new.ts']).toBe('export {}');
    expect(files['src/content/pages/home.toml']).toBe('edited');
  });

  it('carries a deletion through', async () => {
    await deleteFiles(git, { message: 'מחיקה', paths: ['src/content/images.toml'] });
    await publish(git);
    expect(git.filesOn(TARGET_BRANCH)['src/content/images.toml']).toBeUndefined();
  });

  it('fast-forwards the draft onto the published commit', async () => {
    await saveFiles(git, {
      message: 'edit',
      files: [{ path: 'src/content/site.toml', content: 'edited', encoding: 'utf-8' }],
    });
    const result = await publish(git);
    expect(await git.getRefSha(DRAFT_BRANCH)).toBe(result.sha);
    expect(await git.getRefSha(TARGET_BRANCH)).toBe(result.sha);
    expect(await pendingChanges(git)).toEqual([]);
  });

  it('G-10 refuses an empty publish and leaves master untouched', async () => {
    const before = await git.getRefSha(TARGET_BRANCH);
    await expect(publish(git)).rejects.toThrow(/nothing to publish/);
    expect(await git.getRefSha(TARGET_BRANCH)).toBe(before);
  });

  it('refuses whole rather than partially when the draft strays outside content', async () => {
    await git.commitDirect(DRAFT_BRANCH, { 'src/pages/index.astro': 'tampered' }, 'sneaky');
    const before = await git.getRefSha(TARGET_BRANCH);
    await expect(publish(git)).rejects.toThrow(/refusing to write/);
    expect(await git.getRefSha(TARGET_BRANCH)).toBe(before);
  });
});

describe('pending, discard, restore, history', () => {
  it('lists what is waiting to be published', async () => {
    expect(await pendingChanges(git)).toEqual([]);
    await saveFiles(git, {
      message: 'edit',
      files: [{ path: 'src/content/site.toml', content: 'edited', encoding: 'utf-8' }],
    });
    expect(await pendingChanges(git)).toEqual([
      { path: 'src/content/site.toml', status: 'modified' },
    ]);
  });

  it('G-11 discards one path back to master exactly', async () => {
    await saveFiles(git, {
      message: 'two edits',
      files: [
        { path: 'src/content/site.toml', content: 'edited', encoding: 'utf-8' },
        { path: 'src/content/pages/home.toml', content: 'also edited', encoding: 'utf-8' },
      ],
    });
    await discardPath(git, { path: 'src/content/site.toml', message: 'ביטול' });

    const files = git.filesOn(DRAFT_BRANCH);
    expect(files['src/content/site.toml']).toBe(SEED['src/content/site.toml']);
    expect(files['src/content/pages/home.toml']).toBe('also edited');
    expect(await pendingChanges(git)).toEqual([
      { path: 'src/content/pages/home.toml', status: 'modified' },
    ]);
  });

  it('discarding a newly added file removes it', async () => {
    await saveFiles(git, {
      message: 'new',
      files: [{ path: 'src/content/pages/contact.toml', content: 'new', encoding: 'utf-8' }],
    });
    await discardPath(git, { path: 'src/content/pages/contact.toml', message: 'ביטול' });
    expect(git.filesOn(DRAFT_BRANCH)['src/content/pages/contact.toml']).toBeUndefined();
  });

  it('G-12 restores a path to a previous commit byte-exactly', async () => {
    const original = SEED['src/content/site.toml'];
    await saveFiles(git, {
      message: 'edit',
      files: [{ path: 'src/content/site.toml', content: 'edited', encoding: 'utf-8' }],
    });
    await publish(git);

    const commits = await history(git, 10);
    const initial = commits.find((c) => c.message === 'initial')!;
    await restorePath(git, {
      path: 'src/content/site.toml',
      commitSha: initial.sha,
      message: 'שחזור',
    });
    expect(git.filesOn(DRAFT_BRANCH)['src/content/site.toml']).toBe(original);
  });

  it('history reads master and carries a date and author', async () => {
    const commits = await history(git, 10);
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0]).toMatchObject({ author: expect.any(String), date: expect.any(String) });
  });

  it('refuses to restore a path outside content', async () => {
    const commits = await history(git, 10);
    await expect(
      restorePath(git, { path: 'src/pages/index.astro', commitSha: commits[0].sha, message: 'x' }),
    ).rejects.toThrow(/refusing to write/);
  });
});

describe('the published commit message', () => {
  const subjectOf = (message: string): string => message.split('\n')[0];

  it('opens with the agreed prefix', () => {
    expect(publishMessage(['עדכון דף הבית'])).toBe('פרסום ממערכת הניהול: עדכון דף הבית');
  });

  it('carries every distinct message, oldest first', () => {
    const out = publishMessage(['עדכון דף הבית', 'הוספת תמונה', 'עדכון אודות']);
    expect(out).toContain('עדכון דף הבית');
    expect(out).toContain('הוספת תמונה');
    expect(out).toContain('עדכון אודות');
    expect(out.indexOf('עדכון דף הבית')).toBeLessThan(out.indexOf('הוספת תמונה'));
  });

  it('folds repeats: saving one page four times is one thing done', () => {
    const out = publishMessage(['עדכון דף הבית', 'עדכון דף הבית', 'עדכון דף הבית']);
    expect(out).toBe('פרסום ממערכת הניהול: עדכון דף הבית');
  });

  it('keeps the subject readable and moves a long list into the body', () => {
    const many = Array.from({ length: 8 }, (_, i) => `עדכון של פריט מספר ${i + 1} ברשימה`);
    const out = publishMessage(many);
    expect(subjectOf(out).length).toBeLessThanOrEqual(72);
    expect(subjectOf(out)).toContain('פרסום ממערכת הניהול:');
    expect(subjectOf(out)).toContain('8 שינויים');
    for (const m of many) expect(out).toContain(m);
    expect(out.split('\n')[1]).toBe('');
  });

  it('uses only the first line of a multi-line save message', () => {
    expect(publishMessage(['כותרת\n\nגוף ההודעה'])).toBe('פרסום ממערכת הניהול: כותרת');
  });

  it('never produces an empty subject', () => {
    expect(publishMessage([])).toBe('פרסום ממערכת הניהול: עדכון תוכן');
    expect(publishMessage(['', '   '])).toBe('פרסום ממערכת הניהול: עדכון תוכן');
  });

  it('composes the real master commit from the draft commits', async () => {
    await saveFiles(git, {
      message: 'עדכון דף הבית',
      files: [{ path: 'src/content/pages/home.toml', content: 'a', encoding: 'utf-8' }],
    });
    await saveFiles(git, {
      message: 'הוספת תמונה: שיר בטבע',
      files: [{ path: 'src/content/images.toml', content: 'b', encoding: 'utf-8' }],
    });

    await publish(git);
    const [head] = await git.listCommits(TARGET_BRANCH, 1);
    expect(head.message).toBe('פרסום ממערכת הניהול: עדכון דף הבית · הוספת תמונה: שיר בטבע');
  });

  it('does not sweep in commits that were already on master', async () => {
    await git.commitDirect(TARGET_BRANCH, { 'src/content/site.toml': 'x' }, 'עבודה של איתיאל');
    await ensureDraft(git);
    await saveFiles(git, {
      message: 'עדכון דף הבית',
      files: [{ path: 'src/content/pages/home.toml', content: 'a', encoding: 'utf-8' }],
    });

    await publish(git);
    const [head] = await git.listCommits(TARGET_BRANCH, 1);
    expect(head.message).toBe('פרסום ממערכת הניהול: עדכון דף הבית');
    expect(head.message).not.toContain('עבודה של איתיאל');
    expect(head.message).not.toContain('initial');
  });
});

/**
 * A change master has since made for itself is not a change any more.
 *
 * Measuring from the merge base is what protects the images bot, but it also
 * reports a path whose content the two branches have converged on. The owner
 * was being shown a file as "changed" that publishing would not have touched.
 */
describe('a path the two branches agree on', () => {
  const both = '[brand]\nname = "שם חדש"\n';

  beforeEach(async () => {
    git = new FakeGit(SEED);
    await ensureDraft(git);
  });

  it('is not listed as pending once master catches up', async () => {
    await saveFiles(git, {
      message: 'עדכון פרטי הקשר',
      files: [{ path: 'src/content/site.toml', content: both, encoding: 'utf-8' }],
    });
    expect((await pendingChanges(git)).map((c) => c.path)).toEqual(['src/content/site.toml']);

    // Somebody makes the same edit on master directly.
    await saveFiles(git, {
      message: 'same edit, upstream',
      files: [{ path: 'src/content/site.toml', content: both, encoding: 'utf-8' }],
      branch: TARGET_BRANCH,
    });

    expect(await pendingChanges(git)).toEqual([]);
  });

  it('is not published as an empty commit', async () => {
    await saveFiles(git, {
      message: 'עדכון פרטי הקשר',
      files: [{ path: 'src/content/site.toml', content: both, encoding: 'utf-8' }],
    });
    await saveFiles(git, {
      message: 'same edit, upstream',
      files: [{ path: 'src/content/site.toml', content: both, encoding: 'utf-8' }],
      branch: TARGET_BRANCH,
    });
    await expect(publish(git)).rejects.toThrow();
  });

  it('still lists a path the two genuinely differ on', async () => {
    await saveFiles(git, {
      message: 'עדכון פרטי הקשר',
      files: [{ path: 'src/content/site.toml', content: both, encoding: 'utf-8' }],
    });
    await saveFiles(git, {
      message: 'a different edit, upstream',
      files: [
        { path: 'src/content/site.toml', content: '[brand]\nname = "משהו אחר"\n', encoding: 'utf-8' },
      ],
      branch: TARGET_BRANCH,
    });
    expect((await pendingChanges(git)).map((c) => c.path)).toEqual(['src/content/site.toml']);
  });
});
