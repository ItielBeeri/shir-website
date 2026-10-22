/**
 * Every file an image or video id can appear in, derived from the model rather
 * than listed.
 *
 * A hard-coded list silently stops covering a page the day one is added, and
 * the check it feeds is what stops a delete from breaking the build. An id
 * reaches the site through a TOML field of type `image`, through videos.toml
 * (a gallery image standing in as a poster), or through any MDX file - its
 * frontmatter, or a `<SoftImage>` or `<SoftVideo>` in its body.
 */
import { api } from '../api';
import { screens } from '../model/screens';
import { describePath } from '../model/describe';

export interface ReferencingFile {
  path: string;
  label: string;
  content: string;
}

export async function referencingFiles(): Promise<ReferencingFile[]> {
  const tomls = screens
    .filter((s) => s.file?.endsWith('.toml'))
    .filter((s) => s.kind === 'videos' || (s.groups ?? []).some((g) => g.fields.some((f) => f.type === 'image')))
    .map((s) => ({ path: s.file as string, label: s.title }));

  const singleMdx = screens
    .filter((s) => s.file?.endsWith('.mdx'))
    .map((s) => ({ path: s.file as string, label: s.title }));

  const dirs = [...new Set(screens.map((s) => s.dir).filter(Boolean) as string[])];
  const listed = (
    await Promise.all(
      dirs.map(async (dir) => {
        const { files } = await api.list(dir);
        return files
          .filter((f) => f.endsWith('.mdx'))
          .map((f) => ({ path: `${dir}/${f}`, label: describePath(`${dir}/${f}`) }));
      }),
    )
  ).flat();

  const all = [...tomls, ...singleMdx, ...listed];
  const unique = all.filter((f, i) => all.findIndex((o) => o.path === f.path) === i);
  return Promise.all(
    unique.map(async (f) => ({ ...f, content: (await api.read(f.path)).content ?? '' })),
  );
}
