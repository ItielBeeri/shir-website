# cms — the owner's editing surface

A Vite app on its own Vercel project at `admin.shir-amitai.com`. It commits to
the same repository, as the signed-in user, and touches only `src/content/**`
and `public/img/**`.

Design: `log/cms-plan.md` · Tests: `TEST-SPEC.md` · Repo rules: `AGENTS.md` §13.

**This package is deliberately not a pnpm workspace member.** It has its own
`package.json` and lockfile so the site's dependency tree cannot move; the
budgets in `AGENTS.md` §10 are measured against the current one.

```bash
cd cms
pnpm install
pnpm dev      # http://localhost:5175 — UI only; /api needs Vercel
pnpm test     # the fidelity, contract and engine gates
pnpm check    # tsc --noEmit
pnpm build    # tsc && vite build
```

`pnpm dev` serves the app but not the functions, so it stops at the sign-in
screen. Use `vercel dev` from this directory, or a preview deployment, to
exercise anything past it.

## One-time setup

### 1. GitHub App

Already created as `shir-website-editor`, installed on `ItielBeeri/shir-website`
only, with **Contents: read & write** and **Metadata: read** and nothing else.
No private key is needed — every write happens as the signed-in user through
the OAuth flow, never as an installation.

### 2. Vercel project

A second project on the same repository:

| Setting | Value |
|---|---|
| Root Directory | `cms` |
| Framework | Vite |
| Build Command | `pnpm build` (default) |
| Output Directory | `dist` (default) |
| Domain | `admin.shir-amitai.com` |

`cms/vercel.json` carries the SPA rewrite, the security headers and an
`ignoreCommand` so site-only commits do not redeploy it. The site project's
`vercel.json` carries the mirror-image command, so `cms/` commits do not
redeploy the site.

**Both ignore commands use repo-root-relative pathspecs (`:/cms`, `:/src`).**
Vercel runs the Ignored Build Step from the project's Root Directory, so a
plain `-- cms` resolves to `cms/cms` here, matches nothing, exits 0 and cancels
every build. Exit 0 means skip.

### 3. Environment variables

All of these live only in Vercel's encrypted environment — never in the repo,
never in the client bundle.

| Variable | Where the value comes from |
|---|---|
| `GITHUB_APP_CLIENT_ID` | the App's settings page (public identifier) |
| `GITHUB_APP_CLIENT_SECRET` | generated on the App's settings page, shown once |
| `SESSION_SECRET` | generate your own: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `TARGET_REPO` | `ItielBeeri/shir-website` |
| `ALLOWED_GITHUB_LOGINS` | comma-separated GitHub logins allowed to sign in |
| `MAINTAINER_GITHUB_LOGINS` | subset of the above that may edit locked legal fields |
| `PUBLIC_ORIGIN` | `https://admin.shir-amitai.com` |
| `VERCEL_READ_TOKEN` | optional, read-only; powers the publish status indicator |
| `SITE_VERCEL_PROJECT_ID` | optional, the website project's id |

A missing required variable fails the request with a Hebrew message rather than
falling back to something insecure.

## How it is put together

| Path | Holds |
|---|---|
| `src/content/toml-edit.ts` | value-level TOML splices; comments survive |
| `src/content/toml-struct.ts` | adding, reordering and deleting whole entries |
| `src/content/frontmatter.ts` | YAML frontmatter splices, read with Astro's own parser |
| `src/content/mdx-edit.ts` | body block model; untouched blocks emit original bytes |
| `src/model/` | every editable field, with the Hebrew the owner reads |
| `src/git/paths.ts` | **the permission model** — what may be written, and where |
| `src/git/engine.ts` | save, publish, discard, restore, over an injectable transport |
| `api/` | auth and the typed content API; the engine runs here |

### Two rules that are not obvious

**Read content with the site's parsers, not newer ones.** `js-yaml` is pinned
to the major version Astro depends on. Version 5 rejects `psychotherapy.mdx`
and `voice.mdx` outright — their summaries have continuation lines at column 0,
which 4.x folds. `parser-contract.test.ts` fails if the two ever diverge.

**Publish measures from the merge base, never from master's tip.** A tree diff
against the tip reports everything master gained since the draft diverged as if
the draft had deleted it, which would revert the `images.yml` derivative
commits. `engine.test.ts` covers that case directly.
