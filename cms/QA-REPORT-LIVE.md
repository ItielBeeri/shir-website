# CMS live quality report — admin.shir-amitai.com

End-to-end execution of `cms/TEST-SPEC.md` against the **production deployment**, driven
through a real browser as the owner would use it.

| | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Run 6 (current) |
|---|---|---|---|---|---|---|
| **Date** | 2026-09-22 | 2026-09-23 | 2026-09-23 | 2026-09-23 | 2026-09-23 | 2026-09-23 |
| **Build** | `ce3ac9c` | post-`956bfdf` | `5d7fbdc` | `d7ef58f` | `d7ef58f` / `66968c4` | `356cee7` |
| **Roles tested** | maintainer | maintainer | maintainer + owner | owner | owner | owner |
| **Scope** | full | full | full | targeted | the build-dependent gap | **full, weighted to run-5 failures** |
| **Verdict** | Fails; 1 critical | Critical fixed; 2 high | No open high or critical | Mechanism passes; build half unverifiable | Build half closed — one high defect | **No failing acceptance row for the first time** |

Runs 1–3 re-tested everything. Run 4 covered commit `66968c4` and its blast radius. Run 5
closed the build-dependent gap. Run 6 re-tests everything against `356cee7`, weighted toward
what run 5 failed. Findings keep their original numbers across runs; run-6 findings are `R6-`.

---

## 1. Verdict

**Every finding carried into this round is fixed, and the acceptance matrix has no failing row
for the first time in six runs.** `R5-1` — the high-severity defect that made a working preview
look broken — is gone: the very commit that failed in run 5 now resolves to the site's own
deployment, and four fresh builds resolved correctly during this run. `R3-1`, `R4-1` and `R3-2`
are all closed, and the fuzz layer that `X-3` and `F-18` had been waiting on has landed (528
unit tests, up from 195).

Closing `R5-1` also did what closing a blocker usually does: it made the screen behind it
visible, and that screen has its own defect. **The preview now renders — and for a new post or
a deletion it renders a 404 while the CMS says *"התצוגה מוכנה"*** (`R6-1`). Every post the CMS
creates starts hidden, so this is the *default* first-preview experience.

| Exit criterion | Run 1 | Run 3 | Run 5 | Run 6 |
|---|---|---|---|---|
| All 58 acceptance rows pass | No — 6 fail | No fails; 3 blocked | No — 3 fail | **No failures**; 6 partial |
| §4.1 fidelity gates pass live | Mostly | Yes | unchanged | **Yes** — re-proved on a built page and on `www` |
| Build parity (§4.4) | No | No divergence found | Confirmed | **Confirmed** — 4 previews + 2 productions |
| Every §7 guarantee passes | No — 6 fail | All but X-7 residual | X-10 via timeout only | **X-10 via its happy path**; X-3 now passes |
| Zero `axe` violations | No | No contrast or naming failures | unchanged | **No contrast or naming failures**; 4 undersized targets (`R6-3`) |
| Green in CI three times | n/a | n/a | n/a | n/a |

Open after run 6: one medium (`R6-1`), two low (`R6-2`, `R6-3`), one residual by design
(`R2-3`/`X-7`, now spec-consistent), one informational note (`R4-2`). No high or critical.

---

## 2. Round 6 — the fixes, verified

`356cee7` is live: the deployed client bundle carries its marker strings, and the server
returns the `resolved` diagnostic that commit added. `pnpm test` is green (**528 passed**, 19
files) and `pnpm check` is clean.

| Finding | Severity | Verdict |
|---|---|---|
| `R5-1` status discards the site's deployment | HIGH | **Fixed** — see below |
| `R3-1` allowlist permits dotfiles | LOW | **Fixed** — 6/6 probes now 403 `dot-prefixed path segment` |
| `R4-1` `syncPreview` outside the branch allowlist | LOW | **Fixed** — `assertMovableBranch`; preview still syncs, `B-7` still holds |
| `R3-2` deletion publishes as an addition | TRIVIAL | **Fixed** — `הוספת` vs `מחיקת` in the subject |
| `R2-3` bare-URL autolink | by design | **Closed as decided** — `X-7` reworded; re-proved unescapable |
| `F-18` / `X-3` fuzz layer | gap | **Landed** — 4 generated-document properties, and confirmed live |

### R5-1 — fixed, and provably so

The fix replaces hostname-prefix matching with an exact match on the project name GitHub puts
in the deployment's `environment`, checks "is this the site" *before* "is this us", and refuses
to treat an exclusion that removes everything as an answer.

Tested against the exact commit that failed in run 5:

| Commit | Run 5 | Run 6 |
|---|---|---|
| `acaa644d` (run-5 preview) | `unknown`, no URL | **`ready`**, `why: site`, `https://shir-amitai-lq3sh9c5x-…` |
| `18d8d867` (run-6 publish) | — | `ready`, `why: site` |
| 4 fresh preview builds | — | all `ready`, all `why: site` |

The `resolved` diagnostic the commit added is what makes this checkable in one call rather than
three rounds of black-box probing: it reports `self: shir-website-editor`, `site: shir-amitai`,
`selfHost: admin.shir-amitai.com` and the project names seen for the commit. That is the single
most useful thing added this round.

Downstream, the preview iframe renders for the first time in six runs, so **`A-1.5` and `A-9.2`
pass** and **`L-2` is finally assessable** — the preview opens on the page that changed, which
is what `L-2` asks for.

### The end-to-end run

One blog post carried the whole chain: created → hostile body typed → saved → previewed →
published → verified on `www` → deleted → published → verified gone.

| Step | Result |
|---|---|
| Save alone costs no build (`G-14`) | **Pass** — `status` stayed `none` on a healthy account |
| Open preview → build → serve draft (`G-13`) | **Pass** — `ready` in 13–26 s, serving the unpublished text |
| Second and third open, no save (`G-13`) | **Pass** — `moved:false` twice, still one deployment |
| Publish gate (`X-10`) | **Pass, happy path** — disabled while the preview was stale after the draft moved, re-enabled only when the new sha's build was ready |
| Publish applies only changed paths (`G-6`) | **Pass** — `git diff` shows exactly 1 file, no tree swap |
| Published change reaches `www` (`A-9.2`) | **Pass** — post and blog index both served it |
| `vercel-ignore.sh` skips the CMS on a content commit | **Pass** — GitHub reported one deployment, `shir-amitai` only |

### Escaping and fidelity, re-proved on a real page

The hostile paragraph set was typed into the editor and followed all the way to `www`. Every
construct rendered as literal text:

| Typed | On `www` | |
|---|---|---|
| `\|` and `~~קו חוצה~~` | literal | no `<table>`, no `<del>` — both new in this commit |
| `## ##` · `# כותרת` | literal | `h2 = 0`, `h1 = 1` |
| `--- -` · `----` · `====` | literal | `hr = 0`, no setext heading |
| `*` alone · `1. פריט` | literal | no empty list, `ol = 0` |
| `<script>alert(1)</script>` | `&lt;script&gt;…` as text | nothing injected |
| `{expr}` · `&amp;` · `&copy;` | literal | MDX expression and entities both neutralised |
| `https://example.com/qa6` | autolinked | `X-7`'s documented GFM limit |

Two byte-fidelity properties held live, not just in unit tests:

- **Minimal escaping.** Appending `x` to `\----` produced `----x` — the backslash dropped
  because the line stopped being a block start. Net length change: zero.
- **Settling.** Editing a character and reverting it returned the file **byte-identical**, on
  both test posts.

**The list-merge change** (`joinable`) was the largest untested surface. The editor itself
refuses to leave two ordered lists adjacent, so the case had to be forced: two lists separated
by a paragraph, then the paragraph deleted. Result: the file writes one `1.`–`5.` list, reads
back as one list, and a further save is byte-identical. Without the fix that is the shape that
rewrites the file on every save.

### New in round 6

#### R6-1 · The preview shows a 404 and calls it ready — MEDIUM

The preview iframe deep-links to the changed page's URL. For two common cases that URL cannot
exist, and the CMS reports *"התצוגה מוכנה"* over the site's *"הדף לא נמצא"*:

| Case | Why there is no page |
|---|---|
| A new post | Every post the CMS creates starts `draft: true`, and `blog/[slug].astro` filters drafts out of `getStaticPaths` |
| A deleted page | The build under preview is the one in which the page no longer exists |

Both were reproduced this round. The build itself is healthy in each case — `/` and `/blog` on
the same deployment return 200 — so this is purely the choice of URL. The first is the worse of
the two: writing a post and looking at it before publishing is the main reason to preview at
all, and it is the one path that never works.

`X-10` is weakened by the same thing: the owner is told she has seen her change, and what she
saw was a 404. Suggested shape — for a hidden post, preview with the draft flag off, or send
the iframe to the blog index and say why; for a deletion, send it to the parent listing.

#### R6-2 · "צפייה באתר" after publishing goes to a vercel.app snapshot — LOW

The deploy screen says *"השינוי באתר · אפשר לראות אותו עכשיו"* and links to
`https://shir-amitai-28cjc8xck-…vercel.app`, not to `https://www.shir-amitai.com`. It is an
immutable snapshot of that one deployment: correct today, permanently frozen if she bookmarks
or shares it, and not the address she is being told to look at.

The cause is upstream: GitHub's status for the production deployment carries the raw deployment
URL in `environment_url`, confirmed by direct API query. Worth noting alongside it that
`onTheSitesDomain()` — the fallback that recognises the site by its custom domain — therefore
never fires in production, because Vercel never reports a custom domain there. It is not
load-bearing (`who.site` matches first, and `not-ours` catches the rest), but its comment
describes a case the data does not produce.

#### R6-3 · Four controls below the 44 px target the project sets itself — LOW

On the post editor, at both 375 px and desktop width:

| Control | Size |
|---|---|
| `הסרת <tag>` chip buttons (×2) | 28 × 28 |
| `מוצג באתר` checkbox | 22 × 22 (label row 306 × 26, clickable) |
| `תאריך` date input | 119 × 21 (label row 306 × 26, clickable) |

All four have correct accessible names, and the two form controls have clickable labels that
enlarge the practical target. WCAG 2.2 AA's 24 × 24 floor is met except by the raw checkbox and
date box; AGENTS.md §10 asks for 44 × 44, and none of the four reaches it. Pre-existing rather
than a regression — `356cee7` touched no component or stylesheet.

### Also re-confirmed in round 6

- **Permission boundary.** 17 write probes: traversal, backslash, absolute, percent-encoding,
  empty and padded segments, `_opt/`, `.svg`, `.ts`, `src/pages/` — all 403 with a specific
  reason. `B-9` 401s with no cookie. Reads outside the allowlist 403 the same way (the message
  says "refusing to **write**" on a read — cosmetic).
- **`B-7`.** `branch`, `ref` and `targetBranch` in a save body are ignored; `content-preview`
  did not move.
- **Restore is inside the allowlist.** History lists `cms/**` paths for engineering commits, but
  restoring one is refused — the hole that listing might have implied does not exist.
- **Legal lock (`B-12`, `A-10.4`).** As owner: every locked section refused server-side with its
  own Hebrew reason, all three files undeletable and unrenameable, banner text immutable, and
  the cookie / cross-border / named-recipient sentences each enforced separately. The UI
  disables 17 of 31 fields and offers *"בקשת שינוי מאיתיאל"* on each locked section — defence in
  depth, both halves working.
- **`G-11` discard** restored every probe byte-exactly (4 separate files).
- **`G-12` restore** returned `contact.toml` byte-identical to `git show d763763:…` (346 chars).
- **`X-4`** blocks deleting a referenced image and names where it is used; the list was verified
  correct against the repo (`placeholder-portrait` → `home.toml` only).
- **`X-8`** derives `wa.me`, `tel:` and display from one typed number, and the same for email.
- **TOML fidelity**: a contact edit changed 5 lines, preserved all 6 Hebrew comments, the
  alignment padding and the line count.
- **`X-9`** survives a full reload and offers *"שחזור מה שכתבתי"* / *"להתחיל מהגרסה שבאתר"*
  rather than silently overwriting; both branches work and clear local state.
- **Recommendations order** matches file order exactly, including its deliberate out-of-sequence
  entries (`06` before `03`, `13` before `12`) — nothing re-sorts.
- **Accessibility**: on the densest screen, 0 contrast failures, 0 unnamed controls, no heading
  jumps, one `h1`, `lang="he" dir="rtl"`. No horizontal overflow at 375 px.

---
## 3. Round 5 — the build-dependent gap, closed

The seven-step checklist from run 4, executed once Vercel had headroom. Six steps pass. Step 3
found a defect that had been hiding behind "no builds to look at".

| # | Step | Result |
|---|---|---|
| 1 | Save, confirm no deployment appears | **Pass** — `status` stayed `none` for the new draft commit through ~2 minutes, with a healthy account that *could* have built. G-14 now means something. |
| 2 | Open the preview, watch it build | **Build: pass. Display: fail.** GitHub shows exactly one deployment for the draft commit, `environment: "Preview – shir-amitai"`, `state: success`, created 14 s after the sync. Fetching its URL returns **HTTP 200 with the unpublished draft text in it**. The CMS reports `unknown` and renders no iframe. |
| 3 | Check the status returns a **site** URL | **Fail — `R5-1`.** It returns no URL at all. |
| 4 | Which page does the iframe open on (`L-2`) | **Not assessable** — there is no iframe to look at. Blocked by `R5-1`, not by the environment. |
| 5 | Second open with no save → no new build | **Pass** — three opens, `moved:false` twice, and GitHub still reports exactly **one** deployment for the sha. |
| 6 | Publish → site rebuilds and serves it | **Pass** — `Production – shir-amitai` deployment created, `state: success`, and `www.shir-amitai.com/contact` served the published text. |
| 7 | `vercel-ignore.sh` both directions | **Pass** — see below. |

### R5-1 · The CMS discards the site's deployment as its own — HIGH  
*Fixed in `356cee7`; re-tested in run 6 (§2).*


`deploymentStatus` never returns a URL, so the preview iframe never renders and the publish
gate never opens on a real build. The build itself is fine; the *identification* is inverted.

**The evidence.** GitHub's API for the preview commit `acaa644d`:

```
1 deployment  ·  environment: "Preview – shir-amitai"
  status: success
  environment_url: https://shir-amitai-lq3sh9c5x-shiramitai1-3216s-projects.vercel.app
```

That URL serves the draft (`HTTP 200`, the test sentence present twice). The CMS's own
`/api/content/status` for the same sha returns `{ state: "unknown" }`.

Replaying the real payload through `chooseDeployment()` with every plausible identity shows
only one parameterisation that yields `unknown`:

| `self` | `site` | Outcome |
|---|---|---|
| *(unset)* | *(unset or `shir-amitai`)* | picks it — `ready` |
| `shir-website-editor` | *(unset or `shir-amitai`)* | picks it — `ready` |
| **`shir-amitai`** | *(either)* | **`unknown`** |

So `selfProject()` is resolving to **the site's** project slug. `isOurs()` then matches
`shir-amitai-lq3sh9c5x-…` via `belongsTo(slug, self)`, the site's deployment is filtered out as
"ours", `others` is empty, and the function falls through to `unknown`.

**Run 4 corroborates the inversion from the other side.** `status(7b18217)` returned
`shir-website-editor-7z3cjlqve-…` — the CMS's own deployment, presented as the site's. That can
only happen if `isOurs()` was *false* for the CMS's own build. Taken together: the editor
recognises the site as itself and itself as the site, exactly backwards.

**Why it probably happens.** `selfProject()` reads the slug from `VERCEL_BRANCH_URL` (the part
before `-git-`) and falls back to `VERCEL_PROJECT_NAME`. The CMS deployment under test was
pushed manually from the Vercel portal, where `VERCEL_BRANCH_URL` is not necessarily set. One
log line of what `selfProject()` actually returns at runtime would settle it in seconds — that
is worth more than more black-box probing from here.

**What it costs.** `A-1.5`, `A-9.2` and the preview half of `A-9.3` all fail on this one cause,
and `L-2` cannot be assessed. `X-10` still holds, but only through its 90-second timeout: the
owner is always told the build is late and invited to publish unseen, even when a correct
preview finished seconds earlier. The feature this commit exists to enable is built, deployed,
and invisible.

Setting `SITE_VERCEL_PROJECT=shir-amitai` would mask it — `isTheSite()` matches on
`environment.includes("shir-amitai")` and `"Preview – shir-amitai"` contains it — but the
exclusion runs first, so the site would still be filtered out as "ours" before that test is
reached. The fix belongs in `selfProject()`.

### Step 7 — `vercel-ignore.sh`, the other untested risk

The script is correct on every branch reachable from here, and the production evidence agrees:

| Case | Expected | Observed |
|---|---|---|
| `VERCEL_ENV=preview` | never skip | `exit 1` |
| `VERCEL_ENV` unset | never skip | `exit 1` |
| production, no `VERCEL_GIT_PREVIOUS_SHA` | build | `exit 1` |
| production, unreachable previous sha | fetch, else build | `exit 1` (does not fail the deploy) |
| content-only commit → **CMS** project | skip | the publish commit `d763763` has **only** a `Production – shir-amitai` deployment |
| content/site commit → **site** project | build | production deployment created and served |

The one direction not observed in production is a `cms/`-only commit being skipped by the site
project — there has been no such commit since the script landed, and manufacturing one would
mean pushing code to `master` for a test. The path-diff logic behind it is the same expression
that demonstrably worked in the mirror direction.

### Also re-confirmed in run 5

**G-13 build half** — the whole point of `66968c4`: `content-preview` pushed at the draft's
exact commit produced a real, successful build serving the unpublished draft. **G-14** — a save
costs no build even when the account can build. **G-12** — restore used for the cleanup,
byte-exact. **R2-4** — the publish subject named the net change (`פרסום ממערכת הניהול: יצירת קשר`).

---

## 4. Round 4 — the preview-build change (`66968c4`)

### What the commit changes

Saves used to build. `content-draft` was in the site's `deploymentEnabled` allowlist, so every
save spent a Vercel deployment — and on Hobby's 100-a-day cap, a session of editing could
exhaust the account (which is what happened during runs 2 and 3). The commit replaces that:

- a new **`content-preview`** branch is the only non-`master` branch the site builds;
- `content-draft` no longer builds at all;
- a new `preview` API action calls `syncPreview()`, which points `content-preview` **at the
  draft's exact commit** — no new commit — and does nothing if it is already there;
- the preview screen calls it instead of `refs()`, and only when something is pending;
- both projects share `scripts/vercel-ignore.sh`, which skips **production only**, so a
  preview is never skipped and therefore never leaves a commit with no deployment to find.

### Spec changes this required

`cms/TEST-SPEC.md` updated in four places:

| Change | Why |
|---|---|
| **G-13** (already drafted) | the sync itself: right commit, no commit created, idempotent |
| **G-14** *(added)* | the cost claim, which G-13 only implies: a save alone must produce no deployment, and with nothing pending the preview must sync nothing — master's own content should never cost a build |
| **B-7** *(restated)* | it said "push to any branch other than `content-draft`/`master` → rejected". There is now a third branch the server moves. Restated as: content cannot be written to any other branch, and `content-preview` is not a content target — the server only moves that ref onto a commit the draft already holds |
| **X-10** *(amended)* | the build now starts when the preview screen is *opened*, so "publish is unreachable until a preview is ready" needed the other half: the hold must end on its own, or an absent build becomes an inability to publish (run 2's `R2-6`) |

§9's "implemented today" also updated — `engine.test.ts` now covers G-1…G-13 against the
in-memory git; G-14's cost half is only observable against real Vercel.

### Results

| ID | Result | Evidence |
|---|---|---|
| **G-13** | **Pass** | First open returned `{moved: true}` and created `content-preview` at `c0e99ab` — byte-for-byte the draft's own commit, with **zero commits between the two refs**. Second and third opens returned `{moved: false}` and pushed nothing. |
| **G-14** (save costs no build) | **Pass** | A save advanced the draft to `c0e99ab`; `status` for that sha was `none` immediately and still `none` after 40 s. |
| **G-14** (nothing pending) | **Pass** | With an empty pending list the preview screen short-circuits to *"אין שינויים שממתינים לפרסום"* and calls no sync — `content-preview` stayed on its old draft commit instead of moving to master. |
| **X-10** (as amended) | **Pass** | Publish held for 90 s (`PATIENCE_MS`), then released on its own: *"הבנייה מתעכבת. אפשר לפרסם בכל זאת, ולבדוק באתר אחרי דקה."* An absent build no longer traps the owner. |
| **B-7** (restated) | **Pass** | A `save` carrying `branch: "content-preview"` ignored it and landed on `content-draft`. The `preview` action ignores injected `branch` / `sha` — it takes no parameters. |
| **B-9** on the new action | **Pass** | `POST /api/content/preview` without a cookie → `401 unauthenticated`. |
| **Re-sync on draft change** | **Pass** | The riskiest new path: discarding a change *from inside* the preview screen advanced the draft `3f03a10 → c059c1a`, and `content-preview` force-followed to the same commit. The frame does not sit on a superseded commit. |
| **G-8** | **Pass** | Session start fast-forwarded a stale draft (`9364d8d → d7ef58f`). |
| **G-11** | **Pass** | Every discard left the draft's content byte-identical to master. |

### The build half is still unverified — a fourth round

`content-preview` was pushed at the draft's commit and **no deployment appeared for it after
~11 minutes**, across four distinct preview shas. `status` for master also returns `unknown`.
The site's Vercel project is not building at all right now — consistent with the daily cap this
commit exists to avoid, and with the CMS itself having had to be deployed manually from the
portal.

So the mechanism is proven **at the git level** and the degradation path is proven, but the
chain *preview branch → Vercel build → `status(draft sha)` finds it → iframe renders* has still
not been observed end to end. **A-1.5, A-9.2, the preview half of A-9.3, L-2 and the positive
case of R2-7 remain open**, now for the fourth round. Nothing in the code suggests they will
fail; there is simply no build to look at.

**One caveat about the diagnosis.** From the outside, "rate-limited" and "the new
`scripts/vercel-ignore.sh` is skipping everything" look identical: in both cases GitHub has no
deployment for the commit. The Vercel dashboard distinguishes them; my tools do not. The ignore
script is new in this same commit, runs on **both** projects, and has never executed in a way I
could observe — so it carries no evidence either way from this round. Its `exit 0` path skips
production builds, which is the one failure mode that would let a publish land in git and never
reach the site.

### Retest checklist — what to re-run once the limit clears

Everything below needs a real build; nothing else in this report does. It is one sitting of
roughly fifteen minutes.

| # | Step | Closes |
|---|---|---|
| 1 | Edit any text, save, and **confirm no deployment appears** for the new draft commit | G-14 (re-confirm under a healthy account, where a build *could* have happened) |
| 2 | Open **צפייה ופרסום**. Watch the status go `queued` → `building` → `ready`, and the iframe render the real site | G-13 build half · A-1.5 · A-9.3 preview half · X-10 happy path |
| 3 | Check the URL the status returns is a **site** deployment (`shir-amitai-…`), not `shir-website-editor-…` | R2-7 positive case |
| 4 | Note which page the iframe opens on | L-2 (run 1 found it always opens home, never the changed page) |
| 5 | Open the preview a second time with no save in between — **no new build** should start | G-13 idempotence, now observable as a real build count |
| 6 | Publish, and confirm the site actually rebuilds and serves the change | A-9.2 · and the `vercel-ignore.sh` production path, which is the untested risk above |
| 7 | Make a `cms/`-only commit and confirm the **site** project skips it, and a `src/`-only commit and confirm the **CMS** project skips it | `vercel-ignore.sh` both directions — the cost claim that motivated the commit |

Steps 6 and 7 matter most: they are the only ones that exercise the new ignore script, and a
false skip there is worse than a false build.

### R4-1 · `syncPreview` writes a ref outside the engine's own branch allowlist — LOW  
*Fixed in `356cee7`; re-tested in run 6 (§2).*


`assertWritableBranch` still admits only `content-draft` and `master`; `saveFiles`,
`deleteFiles` and `commitOnto` all call it. `syncPreview` calls `updateRef` / `createRef` on
`PREVIEW_BRANCH` directly, without it. Nothing exploitable today — the branch name is a module
constant and the action accepts no parameters, both verified above — but the allowlist no
longer describes every ref the engine moves, which is the invariant B-7 exists to pin down.
Adding `content-preview` to the list as a non-content branch, or asserting it explicitly in
`syncPreview`, would keep code and claim in step.

### R4-2 · Orphaned preview tips — informational, not a defect

`content-preview` is force-moved to each previewed draft commit, and the draft is itself
force-moved onto master at session start. The previously previewed commit then becomes
unreachable from any branch. This is inherent to the design and harmless — it costs nothing and
GitHub garbage-collects eventually — but it does mean a build that lands late renders a draft
state that no longer exists. Worth knowing when reading a stale preview URL.

### Carried forward unchanged

**R3-1 was still open at run 4** (it is fixed as of `356cee7` — §2). `paths.ts` was touched by
`66968c4`, so the dotfile probe was re-run at the time:
`src/content/.hidden4.toml` still returns **200** and commits, while `src/pages/index.astro`,
`src/content/../../etc/passwd` and `public/img/_opt/x.webp` are all still correctly `403`. The
probe was deleted.

---

## 5. Round 3 — every run-2 finding re-tested

| Finding | Status | Evidence |
|---|---|---|
| **R2-1** navigation dead-end (HIGH) | **Fixed** | All three exit routes — back, title, drawer — now raise *"יש כאן שינויים שלא נשמרו · אם תצאי עכשיו הם לא יעלו לאתר. מה שכתבת נשמר בדפדפן ויחכה לך כאן כשתחזרי."* with **חזרה לעריכה** / **יציאה בלי לשמור**. Both branches verified: staying keeps the edit, leaving proceeds — and the draft *is* kept, then offered again on return. |
| **R2-6** no publish override (HIGH) | **Fixed** | With no deployment available the status degrades to *"לא הצלחתי לקבל מצב בנייה. אפשר לפרסם, ולבדוק באתר אחרי דקה."* and **publish is enabled**. I published twice through the UI this round — run 2 required calling the API. The post-publish screen also now reports honestly: *"מחכה שהבנייה תתחיל… כבר 9 שניות."* |
| **R2-2** wrong-case slug preview | **Fixed** | New posts are created lowercase (`qa3-בדיקת-…`), and the rename preview lowercases live: typing `QA3 UPPER Mixed כתובת` previews `/blog/qa3-upper-mixed-כתובת`. |
| **R2-4** publish message counted actions | **Fixed** | Subject now names the net change: `פרסום ממערכת הניהול: הפוסט «qa3-בדיקת-סיבוב-שלישי-ציטוט-ותגית»`. The body still lists the draft's commit subjects, which is a reasonable audit trail now that the subject is truthful. |
| **R2-5** legal date in UTC | **Fixed** | Editing the accessibility statement after midnight Israel time wrote `updated = "2026-09-23"`. At the same hour in run 2 it wrote `2026-09-22`. |
| **R2-7** status reported the CMS's deployment | **No longer mis-attributing** | The status no longer returns a `shir-website-editor-…` URL. It now returns `unknown` when it finds no site deployment, which is correct given none exist. Cannot be fully re-confirmed until Vercel deploys again. |
| **R2-3** bare URL autolinks | **Open, by design** | GFM still turns a bare `https://…` in body copy into an anchor. Markdown link *syntax* remains neutralised. Arguably desirable; noted only because X-7 is worded absolutely. |
| **N-7** 40 px target | **Fixed** | No control below 44×44 px at any tested width. |
| **X-13** inline validation residual | **Fixed** | Balance errors now appear **as you type**, with save disabled — no round trip. Both rules render in Hebrew simultaneously. |

---

## 6. The owner role — closed at last, and it passes

Deferred in runs 1 and 2. Tested this round under a genuine `shiramitai1` / `role: owner`
session.

**A-10.4 — locked fields.** 17 of 31 legal fields are disabled for the owner; the maintainer
banner is absent. A locked section shows exactly what the spec asks for:

> **רמת הנגישות והתקן שלפיו הונגש האתר**
> הסעיף מצהיר לפי איזה תקן האתר הונגש. שינוי שלו הוא שינוי של ההצהרה עצמה.
> **[בקשת שינוי מאיתיאל]**

A Hebrew reason, and the request affordance. The same fields are editable for `maintainer`
(verified in runs 2 and 3), which is the other half of A-10.4.

**The lock is not just the textarea.** Every satellite control in a locked section — *העברה
למעלה*, *העברה למטה*, *מחיקת פסקה*, *+ הוספת פסקה* — is also disabled, so the owner cannot
reorder or delete her way around it.

**X-11 — the API path.** The guarantee requires the direct call to be rejected too. Three
probes with an owner session:

| Attempt | Result |
|---|---|
| Rewrite the locked *"רמת הנגישות והתקן"* section | **400 `legal-rejected`** — *"הסעיף מצהיר לפי איזה תקן האתר הונגש…"* |
| Reduce the locked consent `body` to `"עוגיות."` | **400 `legal-rejected`** — *"המשפט על העוגיות ועל העברת המידע מחוץ לישראל הוא הבסיס החוקי להסכמה. אי אפשר לקצר אותו."* |
| Weaken the refusal: `accept = "כן, בשמחה! (מומלץ)"` / `decline = "לא"` | **400 `legal-rejected`** — *"שני הכפתורים חייבים להישאר שווים בניסוח ובמשקל…"* |
| Edit an **unlocked** section (control) | **200** — correctly allowed |

**X-11 passes on both paths**, with the precise reason returned rather than a generic refusal.

**A-10.2** — the clinic-accessibility section is fully editable for the owner and carries no
request affordance, exactly as required.

---

## 7. New in run 3

> Both findings in this section were **fixed in `356cee7`** and re-tested in run 6 (§2). Kept
> as written for the record.

### R3-1 · The write allowlist permits dotfiles and dot-directories — LOW
`pathRejection()` validates prefix, extension, traversal, NFC, control characters, backslashes
and padded segments — but not a leading `.` on a path segment. Probes with an authenticated
session:

| Path | Result |
|---|---|
| `src/content/.hidden.toml` | **200 — committed** |
| `public/img/content/.hidden.jpg` | **200 — committed** |
| `src/content/.git/config.toml` | passed the allowlist; **502** only because GitHub refuses `.git` as a tree name |
| `src/content/.toml` | 403 (dot-only name rejected) |

The blast radius is small: only `.toml`/`.mdx` under `src/content/` and `.jpg`/`.png`/`.webp`
under `public/img/` are reachable, so nothing executable can be written, and the owner cannot
name a path through the UI at all. But §5.3's premise is that the proxy is the permission
model against *crafted* requests, and a `.git`-named directory reaching GitHub at all is the
kind of thing that should die in `pathRejection`, not upstream. Rejecting any segment starting
with `.` is a one-line fix.

Both committed probes were deleted; `git ls-tree` on master confirms no residue.

### R3-2 · A deletion publishes under the same subject as an addition — TRIVIAL
Publishing the removal of a post produced
`פרסום ממערכת הניהול: הפוסט «qa3-…»` — identical to the subject when the same post was added.
The change list on screen says *"· נמחק"* correctly; only the commit subject is ambiguous.

---

## 8. Regression sweep — everything from runs 1 and 2, re-verified

**The critical fix holds.** Re-typed the full hostile set plus new constructs. The serialized
MDX escapes `#`, `[`, `]`, `-`, `*`, `` ` ``, `>`, `1.`, `<`, `{` **and** `![alt](x.png)`:

```
\# ניסיון כותרת ראשית
\[קישור אסור\](https://example.com)
\## שנייה וגם בדיקה https://bare-url.example באמצע
\<script>alert(1)\</script> \{expr} | טבלה | --- וגם !\[alt\](x.png)
```

Run 2 proved the rendered result in production (`h1count: 1`, no `<h2>`, all literal). The
escaping code path is unchanged since, and `cms/src/content/escaping.test.ts` was added this
round to lock it in.

**Fidelity.** `excerpt` still emits a YAML block scalar (`|-`) preserving the newline. An
injected unmodelled key **and** a Hebrew maintainer comment both survived a body-only UI save
byte-for-byte; EOF bytes identical to master; line delta exactly the two injected lines.
`mdx-edit.ts` changed this round, so this was re-run deliberately — **F-8, F-9, F-11, F-16
hold.**

**Write path.** G-1, G-2, G-4, G-8, G-11, G-12 all re-verified. Two UI publishes applied
exactly the intended paths and nothing else. Restore still expands a commit to its file list
with Hebrew path descriptions (`הפוסט «…»`, `תפריט וכותרת תחתונה`, `עמודים משפטיים`) and a
Hebrew confirm; a restore whose target matches current correctly produces no pending change.

**Boundary.** B-1…B-4 and B-8 re-run with 20 hostile paths — all rejected except the dotfile
cases in R3-1. B-9 (`401` for start/save/publish without a cookie) and B-12 (no secret-shaped
strings; cookie invisible to JS) both pass.

**Content screens.** X-4 still blocks deleting a referenced image and names *"עמוד טקסים"*.
X-8 still derives `whatsapp_url` + `phone_href` + `phone_display` from one field. A-8.4, V-2,
A-10.3/X-12, A-4.9 (confirm-guarded delete with a Hebrew caution), A-7.3 all pass.

**Non-functional.** Zero contrast failures across all tokens; one `<h1>` per screen; no
control under 44 px; no horizontal scroll or overflow at 320 / 759 / 1600; drawer is a proper
modal with focus return; drafts persist and are offered back after a hard reload.

---

## 9. Acceptance matrix — after run 6

`P` pass · `F` fail · `~` partial · `–` not exercised

Rows below are run 3's full sweep, with the build-dependent rows resolved by run 5 and the
three run-5 failures re-tested in run 6.

| Ch. 1 | | Ch. 2 | | Ch. 3 | | Ch. 4 | | Ch. 5 | |
|---|---|---|---|---|---|---|---|---|---|
| A-1.1 | **P** | A-2.1 | **P** | A-3.1 | **P** | A-4.1 | **P** | A-5.1 | **P** |
| A-1.2 | **P** | A-2.2 | **P** | A-3.2 | **P** | A-4.2 | **P** | A-5.2 | **P** |
| A-1.3 | **P** | A-2.3 | **P** | A-3.3 | **P** | A-4.3 | **P** | A-5.3 | **P** |
| A-1.4 | **P** | A-2.4 | **P** | A-3.4 | **P** | A-4.4 | **P** | A-5.4 | **P** |
| A-1.5 | **P** | A-2.5 | **P** | A-3.5 | ~ | A-4.5 | **P** | A-5.5 | **P** |
| A-1.6 | **P** | | | A-3.6 | **P** | A-4.6 | **P** | | |
| A-1.7 | **P** | | | | | A-4.7 | **P** | | |
| | | | | | | A-4.8 | **P** | | |
| | | | | | | A-4.9 | **P** | | |

| Ch. 6 | | Ch. 7 | | Ch. 8 | | Ch. 9 | | Ch. 10 | |
|---|---|---|---|---|---|---|---|---|---|
| A-6.1 | **P** | A-7.1 | **P** | A-8.1 | **P** | A-9.1 | ~ | A-10.1 | **P** |
| A-6.2 | **P** | A-7.2 | **P** | A-8.2 | **P** | A-9.2 | **P** | A-10.2 | **P** |
| A-6.3 | **P** | A-7.3 | **P** | A-8.3 | **P** | A-9.3 | ~ | A-10.3 | **P** |
| A-6.4 | **P** | A-7.4 | **P** | A-8.4 | **P** | A-9.4 | **P** | A-10.4 | **P** |
| A-6.5 | ~ | A-7.5 | ~ | A-8.5 | **P** | A-9.5 | ~ | A-10.5 | **P** |
| | | | | | | | | A-10.6 | **P** |

**Tally — 52 P · 0 F · 6 ~ · 0 – · 0 ⊘**
(run 5: 50 P · 3 F · 5 ~ — run 3: 50 P · 0 F · 6 ~ · 2 ⊘ — run 2: 45 P · 0 F · 7 ~ · 1 – · 3 ⊘ —
run 1: 34 P · 6 F · 15 ~ · 3 –)

**No failing row, and nothing blocked.** The two run-5 failures that were purely about reporting
state — **A-1.5** and **A-9.2** — now pass on the same evidence that condemned them.

**A-9.3** moves from fail to partial rather than to pass. Its second half, one-click restore
from history, passes outright and was re-verified byte-exactly. Its first half, "preview
precedes publish", now happens — but `R6-1` means that for a new post or a deletion what
precedes publish is a 404 labelled *"התצוגה מוכנה"*. The mechanism is there; what it shows is
not yet trustworthy in those two cases.

### Guarantees

| | | | | | |
|---|---|---|---|---|---|
| X-1 **P** | X-2 **P** | X-3 **P** | X-4 **P** | X-5 **P** | X-6 **P** |
| X-7 ~ | X-8 **P** | X-9 **P** | X-10 ~ | X-11 **P** | X-12 **P** |
| X-13 **P** | X-14 **P** | X-15 **P** | X-16 ~ | R-1 **P** | R-2 **P** |

X-3 now passes: the generated-document properties landed and were confirmed live — a second
save writes the same bytes, every block stays its own block, and no heading, list, table or
rule appeared on `www` that was not asked for. X-7 partial: link syntax neutralised, bare-URL
autolink remains, now recorded in the spec as a GFM property rather than a defect (`R2-3`).
X-10 moves to partial: its gate passes on the happy path, but `R6-1` means "something she has
not seen" is still reachable — she can be shown a 404 and told it is her page. X-16 partial:
the only Latin in the UI is GitHub author logins in history and the `Enter` / `Shift + Enter`
key names.

---

## 10. Still not verified

| Area | Reason |
|---|---|
| **`vercel-ignore.sh`, site-skips-`cms/`** | The mirror direction is confirmed in production again this round; this one has had no qualifying commit since the script landed, and forcing one would mean pushing code to `master` purely for a test. |
| **`axe` (N-5)** | The CMS's own CSP (`script-src 'self'`) blocks loading axe-core. Substituted a scripted audit: contrast ratios against computed backgrounds, accessible names, roles, focus visibility, target sizes, heading structure, unlabelled fields. It is what found `R6-3`. |
| **N-16 / N-17 on 4G** | No throttling available. Eager payload is 174 KB across two chunks (entry 32.5 KB + react 142 KB), with the editor and vendor chunks lazy. |
| **F-18's TOML half** | The MDX half landed and is verified. The TOML fuzzer is still unwritten, per TEST-SPEC §9. |
| **Maintainer role, this round** | Run 6 ran as `owner` throughout. The owner-facing half of every lock is the security-relevant direction and passes; the maintainer-can-edit half is carried from run 3. |
| **B-10** | Needs a second, non-allow-listed GitHub account. |
| **B-11** | Verified by code: the cookie is AES-256-GCM sealed, HttpOnly, Secure, SameSite=Lax, so tampering fails the auth tag. |

`L-2` leaves this table: it is assessable now, and the preview does open on the page that
changed. Whether that page exists is `R6-1`, not `L-2`.

---

## 11. Repository state — clean

```
git diff --name-status 356cee7 origin/master -- src/content public/img
  (empty — content byte-identical to the round-6 baseline)
```

- Run 6 published a blog post and then published its deletion. `www.shir-amitai.com` was
  checked afterwards: the post 404s, the blog index no longer lists it, home and contact are
  200. Net content change: zero.
- `content-draft` and `master` are the same commit (`98ef370`); `pending` and `conflicts` are
  both empty and the local draft store is `{}`.
- `content-preview` remains at the last previewed draft commit, which is the product's own
  steady state (`R4-2`), not residue.
- `git ls-tree` on master shows no `qa2`/`qa3`/`qa6`/`.hidden`/`X.TOML`/probe residue.
- Every probe that landed during run 6 was reverted by the product's own mechanism: three
  `discard` calls on `home.toml`, `site.toml` and `contact.toml`, and `delete` on
  `x.TOML` and the second test post. Each was verified byte-identical to `master` afterwards.
- Every dotfile probe was refused before it could land — that is `R3-1` being fixed.
- The working tree is clean; runs 4–5's report edits landed in `356cee7`.

---

## 12. Suggested order of work

1. **R6-1** — the preview's URL choice. It is the only item that reaches the owner as a broken
   feature, it blocks the main reason to preview at all, and it is what keeps `A-9.3` and
   `X-10` off a clean pass. Cheapest correct fix: build the preview URL from what the change
   will actually produce rather than from the path that changed.
2. **R6-2** — point "צפייה באתר" at `https://www.shir-amitai.com` (plus the changed page's
   path) instead of echoing the deployment URL GitHub reports.
3. **R6-3** — bring the four small controls to 44 × 44, or state in the spec that the CMS
   follows WCAG 2.2's 24 px rather than the site's 44 px.
4. **F-18's TOML half** — the MDX fuzzer paid for itself immediately, by the fix session's own
   account. The same argument applies to TOML, which is where the original live incident was.
5. **Cosmetic** — the read-path rejection says "refusing to write"; `onTheSitesDomain()`'s
   comment describes a production shape Vercel does not actually report (`R6-2`).
