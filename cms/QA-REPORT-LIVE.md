# CMS live quality report — admin.shir-amitai.com

End-to-end execution of `cms/TEST-SPEC.md` against the **production deployment**, driven
through a real browser as the owner would use it.

| | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 (current) |
|---|---|---|---|---|---|
| **Date** | 2026-09-22 | 2026-09-23 | 2026-09-23 | 2026-09-23 | 2026-09-23 |
| **Build** | `ce3ac9c` | post-`956bfdf` | `5d7fbdc` | `d7ef58f` | `d7ef58f` / `66968c4` |
| **Roles tested** | maintainer | maintainer | maintainer + owner | owner | owner |
| **Scope** | full | full | full | targeted | **the build-dependent gap** |
| **Verdict** | Fails; 1 critical | Critical fixed; 2 high | No open high or critical | Mechanism passes; build half unverifiable | **Build half closed — and it exposed one high defect** |

Runs 1–3 re-tested everything. Run 4 covered commit `66968c4` and its blast radius. Run 5
closed the one remaining gap: everything that needed a real Vercel build, now that the account
has headroom. Findings keep their original numbers across runs; run-5 findings are `R5-`.

---

## 1. Verdict

**The build-dependent gap is closed, and closing it turned a "cannot verify" into a
confirmed high-severity defect.** The preview mechanism `66968c4` introduced works: the branch
is pushed, Vercel builds it, and the built preview serves the owner's unpublished draft. But
the CMS **cannot see its own preview** — `deploymentStatus` mistakes the site's deployment for
its own and discards it, so the status never leaves *"לא הצלחתי לקבל מצב בנייה"* and the iframe
never renders (`R5-1`).

Everything else in run 5 passes, including the cost goal the commit was written for.

| Exit criterion | Run 1 | Run 2 | Run 3 | Run 5 |
|---|---|---|---|---|
| All 58 acceptance rows pass | No — 6 fail | No — 1 fail | No fails; 3 blocked | **No — 3 fail** (`A-1.5`, `A-9.2`, `A-9.3`), all one root cause |
| §4.1 fidelity gates pass live | Mostly | Yes | Yes | unchanged |
| Build parity (§4.4) | No | Improved | No divergence found | **Confirmed** — published change built and served |
| Every §7 guarantee passes | No — 6 fail | Near | All pass except X-7 residual | **X-10 passes only via its timeout**, never its happy path |
| Zero `axe` violations | No | Contrast fixed | No contrast or naming failures | unchanged |
| Green in CI three times | n/a | n/a | n/a | n/a |

Open after run 5: one high (`R5-1`), two low (`R3-1`, `R4-1`), one residual by design
(`R2-3`), one informational note (`R4-2`). Nothing is blocked by the environment any more.

---

## 2. Round 5 — the build-dependent gap, closed

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

## 3. Round 4 — the preview-build change (`66968c4`)

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

**R3-1 is still open.** `paths.ts` was touched by this commit, so the dotfile probe was re-run:
`src/content/.hidden4.toml` still returns **200** and commits, while `src/pages/index.astro`,
`src/content/../../etc/passwd` and `public/img/_opt/x.webp` are all still correctly `403`. The
probe was deleted.

---

## 4. Round 3 — every run-2 finding re-tested

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

## 5. The owner role — closed at last, and it passes

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

## 6. New in run 3

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

## 7. Regression sweep — everything from runs 1 and 2, re-verified

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

## 8. Acceptance matrix — after run 5

`P` pass · `F` fail · `~` partial · `–` not exercised

Rows below are run 3's full sweep, with the three build-dependent rows resolved by run 5.

| Ch. 1 | | Ch. 2 | | Ch. 3 | | Ch. 4 | | Ch. 5 | |
|---|---|---|---|---|---|---|---|---|---|
| A-1.1 | **P** | A-2.1 | **P** | A-3.1 | **P** | A-4.1 | **P** | A-5.1 | **P** |
| A-1.2 | **P** | A-2.2 | **P** | A-3.2 | **P** | A-4.2 | **P** | A-5.2 | **P** |
| A-1.3 | **P** | A-2.3 | **P** | A-3.3 | **P** | A-4.3 | **P** | A-5.3 | **P** |
| A-1.4 | **P** | A-2.4 | **P** | A-3.4 | **P** | A-4.4 | **P** | A-5.4 | **P** |
| A-1.5 | **F** | A-2.5 | **P** | A-3.5 | ~ | A-4.5 | **P** | A-5.5 | **P** |
| A-1.6 | **P** | | | A-3.6 | **P** | A-4.6 | **P** | | |
| A-1.7 | **P** | | | | | A-4.7 | **P** | | |
| | | | | | | A-4.8 | **P** | | |
| | | | | | | A-4.9 | **P** | | |

| Ch. 6 | | Ch. 7 | | Ch. 8 | | Ch. 9 | | Ch. 10 | |
|---|---|---|---|---|---|---|---|---|---|
| A-6.1 | **P** | A-7.1 | **P** | A-8.1 | **P** | A-9.1 | ~ | A-10.1 | **P** |
| A-6.2 | **P** | A-7.2 | **P** | A-8.2 | **P** | A-9.2 | **F** | A-10.2 | **P** |
| A-6.3 | **P** | A-7.3 | **P** | A-8.3 | **P** | A-9.3 | **F** | A-10.3 | **P** |
| A-6.4 | **P** | A-7.4 | **P** | A-8.4 | **P** | A-9.4 | **P** | A-10.4 | **P** |
| A-6.5 | ~ | A-7.5 | ~ | A-8.5 | **P** | A-9.5 | ~ | A-10.5 | **P** |
| | | | | | | | | A-10.6 | **P** |

**Tally — 50 P · 3 F · 5 ~ · 0 – · 0 ⊘**
(run 3: 50 P · 0 F · 6 ~ · 2 ⊘ — run 2: 45 P · 0 F · 7 ~ · 1 – · 3 ⊘ — run 1: 34 P · 6 F · 15 ~ · 3 –)

All three failures are `R5-1`, one root cause. **A-1.5** — the status does not match the real
deployment state; it reports "couldn't get build state" while the build is `success`.
**A-9.2** — the publish itself is truthful in git and on the site, but the state *shown* is not.
**A-9.3** — the preview never precedes publish because it never renders; the history/restore
half of that row passes.

Nothing is blocked by the environment any more: the ⊘ column is empty for the first time.

### Guarantees

| | | | | | |
|---|---|---|---|---|---|
| X-1 **P** | X-2 **P** | X-3 – | X-4 **P** | X-5 **P** | X-6 **P** |
| X-7 ~ | X-8 **P** | X-9 **P** | X-10 **P** | X-11 **P** | X-12 **P** |
| X-13 **P** | X-14 **P** | X-15 **P** | X-16 ~ | R-1 **P** | R-2 **P** |

X-7 partial: link syntax neutralised, bare-URL autolink remains (R2-3). X-16 partial: the only
Latin in the UI is GitHub author logins in history and the `Enter` / `Shift + Enter` key names.

---

## 9. Still not verified

| Area | Reason |
|---|---|
| **L-2** | Cannot be assessed while `R5-1` stands — there is no iframe to inspect. Unblocked the moment the status returns a URL. |
| **`vercel-ignore.sh`, site-skips-`cms/`** | The mirror direction is confirmed in production; this one has had no qualifying commit since the script landed, and forcing one would mean pushing code to `master` purely for a test. |
| **`axe` (N-5)** | The CMS's own CSP (`script-src 'self'`) blocks loading axe-core. Substituted a scripted audit: contrast ratios against computed backgrounds, accessible names, roles, focus visibility, target sizes, heading structure, unlabelled fields. |
| **N-16 / N-17 on 4G** | No throttling available. Eager payload is 174 KB across two chunks (entry 32.5 KB + react 142 KB), with the editor and vendor chunks lazy. |
| **X-3, F-18** | A generated-sequence fuzz campaign, not a browser task. Still unwritten per TEST-SPEC §4.1. |
| **B-10** | Needs a second, non-allow-listed GitHub account. |
| **B-11** | Verified by code: the cookie is AES-256-GCM sealed, HttpOnly, Secure, SameSite=Lax, so tampering fails the auth tag. |

---

## 10. Repository state — clean

```
git diff --name-status d7ef58f origin/master -- src/content public/img
  (empty — content byte-identical to the round-5 baseline)
```

- Run 5 published a change and then published its restoration; `www.shir-amitai.com` was
  checked afterwards and no longer carries the test text. Net content change: zero.
- `content-preview` remains at the last previewed draft commit, which is the product's own
  steady state (`R4-2`), not residue.
- Run 3's two publishes were likewise both reverted.
- `content-draft` content is byte-identical to `master` (it carries only forward discard
  commits, which is the designed behaviour).
- `git ls-tree` on master shows no `qa2`/`qa3`/`.hidden`/`X.TOML` residue.
- Every probe that landed — two dotfiles, an over-long filename, an uppercase-extension file —
  was deleted.
- The injected `qa3_unknown` frontmatter key was discarded.
- The working tree was never modified by these tests.

> That uncommitted work has since landed as `66968c4` and is what runs 4 and 5 cover.

---

## 11. Suggested order of work

1. **R5-1** — the only high-severity item open, and the one that makes a working feature look
   broken. Log what `selfProject()` returns on the deployed CMS; if it is the site's slug, fix
   the derivation rather than papering over it with `SITE_VERCEL_PROJECT`. Closing it also
   closes A-1.5, A-9.2, A-9.3 and unblocks L-2.
2. **R3-1** — reject any path segment starting with `.` in `pathRejection()`. One line, closes
   the last hole in the write allowlist. Still open after `66968c4` touched `paths.ts`.
3. **R4-1** — bring `syncPreview` under the branch allowlist, so the allowlist again describes
   every ref the engine moves.
4. **R2-3** — decide explicitly whether bare-URL autolinking is wanted. If yes, reword X-7 in
   the spec; if no, escape the scheme too.
5. **R3-2** — distinguish addition from deletion in the publish subject.
6. **F-18 / X-3** — the fuzz layer remains the largest untested surface in the spec, and the
   cheapest insurance in it.
