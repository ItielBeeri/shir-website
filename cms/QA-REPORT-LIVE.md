# CMS live quality report — admin.shir-amitai.com

End-to-end execution of `cms/TEST-SPEC.md` against the **production deployment**, driven
through a real browser as the owner would use it.

| | Run 1 | Run 2 (current) |
|---|---|---|
| **Date** | 2026-09-22 | 2026-09-23 |
| **Build under test** | `ce3ac9c` | post-`956bfdf` (`index-Cy-Xi7a0.js`, code-split) |
| **Signed-in role** | maintainer | maintainer |
| **Repo at start** | `master` = `content-draft` = `ce3ac9c` | `master` `5858e01`, draft `39a94fb` |
| **Verdict** | Suite fails; 1 critical | Critical fixed; 1 new high; 2 areas unverifiable |

Run 2 re-tested **everything** — the previously-failing rows *and* the previously-passing
ones, to catch regressions. Findings are numbered as in run 1 (`C-`, `H-`, `M-`, `L-`) so the
two reports line up; new run-2 findings are numbered `R2-`.

---

## 1. Verdict

**The critical defect is fixed, and fixed properly.** Run 1's headline — the CMS writing the
owner's body text into MDX unescaped, producing a second `<h1>` and a live link — is gone,
verified on the built production page rather than by reading code. Of run 1's ten `H-` items
and nine `M-`/`L-` items, **every one is fixed or materially improved.** That is an unusually
clean sweep.

Three things stop this being a pass:

1. **R2-1 (new, high).** While a form has unsaved changes, *every* way out of the screen is
   silently blocked — back, the title, and every drawer destination. No dialog, no message.
   The owner is trapped until she saves or manually undoes her edit.
2. **R2-6 (high, environment-triggered).** When a deployment does not arrive, the publish
   button is disabled forever with no timeout and no override. This is not hypothetical — it
   happened during this run because Vercel was rate-limiting, and it turned a build hiccup
   into a total inability to publish through the UI.
3. **Two areas remain unverified** (§7): the owner-role legal locks, and everything that
   depends on a preview deployment.

| Exit criterion | Run 1 | Run 2 |
|---|---|---|
| All 58 acceptance rows pass | No — 6 fail | **No** — 1 fail, 2 blocked, 5 partial |
| §4.1 fidelity gates pass live | Mostly | **Yes** (TOML exact; MDX EOF fixed; unknown keys preserved) |
| Build parity (§4.4) | No | **Improved** — no evidence of divergence found |
| Every §7 guarantee passes | No — 6 fail | **Near** — X-6/X-7/X-9/X-11/X-13/X-14 now hold; X-7 has a residual |
| Zero `axe` violations | No | **Contrast and naming now pass**; full axe still not runnable (§7) |
| Green in CI three times | n/a | n/a |

---

## 2. The critical defect is fixed — with production proof

Run 1's **C-1** (fails X-6, X-7, R-2) is resolved. The serializer now escapes markdown. I
typed the identical hostile input plus four more constructs, published it, and read the built
page at `https://www.shir-amitai.com/blog/qa2-כתובת-חדשה-אחרי-שינוי`:

```
h1count: 1          h1s: ["QA2 בדיקת רגרסיה: \"ציטוט\" ו#תגית"]
h2s:     []
body:    # ניסיון כותרת ראשית  [קישור אסור](https://example.com)  ## ניסיון כותרת שנייה
         - ניסיון רשימה …  > ניסיון ציטוט …  1. ניסיון רשימה ממוספרת
         <script>alert(1)</script>  <SoftImage id="x" />  {expr}
```

Exactly one `<h1>` — the post title. No `<h2>`. Every construct renders as literal text. The
on-disk MDX shows why:

```
\# ניסיון כותרת ראשית
\[קישור אסור\](https://example.com)
\- ניסיון רשימה וגם > ציטוט וגם \*כוכבית\* וגם \`קוד\`
\> ניסיון ציטוט בתחילת שורה
1\. ניסיון רשימה ממוספרת
\<script>alert(1)\</script> וגם \<SoftImage id="x" /> וגם \{expr}
```

`#`, `[`, `]`, `-`, `*`, `` ` ``, `>`, `1.`, `<` and `{` are all escaped — including the MDX-specific
`<jsx>` and `{expr}` forms, which run 1 never even probed. Paragraph separation is also
restored (run 1 collapsed four paragraphs into one block). **R-2 cannot recur.**

Run 1's **H-1** is fixed in the same area: multi-line frontmatter is now emitted as a YAML
block scalar, so the owner's line break survives.

```yaml
excerpt: |-
  שורה ראשונה של ההזמנה.
  שורה שנייה אחרי ירידת שורה.
```

Parsed with the CMS's own pinned `js-yaml`: `excerpt contains newline: true`. Run 1 folded it
to a space.

---

## 3. New in run 2

### R2-1 · Unsaved changes trap the owner on the screen — HIGH
The unsaved-changes work (which correctly fixed X-9) introduced a navigation dead-end. With
one character typed into any form, I tried all three exit routes:

| Route | Result |
|---|---|
| Back button (`חזרה`) | nothing happens |
| Screen title / home button | nothing happens |
| Any drawer destination | drawer closes, nothing happens |

No modal, no banner, no console error. The drawer closing makes it look like the click
registered, so the app appears frozen. Navigation resumes the instant the field is reverted to
its pristine value. There is no "discard and leave" affordance, so the only exits are saving
the change or manually retyping the original text.

This is worse than run 1's behaviour (which discarded silently): run 1 lost work, run 2 blocks
the owner. The right shape is the one the app already uses on reload — a Hebrew choice between
keeping and discarding.

### R2-6 · No timeout or override when a deployment never arrives — HIGH
`deploymentStatus` correctly returns `none` when GitHub has no deployment for a sha. The
preview screen maps that to *"מחכה שהבנייה תתחיל…"* and **disables publish indefinitely**.

During this run Vercel was rate-limiting, so no deployment was created for any draft sha. I
observed the draft stuck at `none` for **3.5 minutes** across two separate attempts, with:

- no preview iframe,
- publish disabled,
- no override button, no timeout, no way to proceed.

The owner simply cannot publish. I completed the publish test only by calling
`/api/content/publish` directly — which she cannot do.

The trigger was environmental, but the gap is real and is a **regression in robustness**: run
1's build returned `unknown` in this situation and allowed publishing with the honest caveat
*"אפשר לפרסם, ולבדוק באתר אחרי דקה."* Tightening X-10 removed that escape hatch. A rate limit,
a paused project or a queued build now becomes a content-publishing outage with no recourse.

### R2-2 · Rename previews the wrong URL — MEDIUM
The rename dialog previews `הכתובת החדשה תהיה: /blog/QA2-כתובת-חדשה-אחרי-שינוי` and warns that
the old URL will break. The site actually serves the slug **lowercased**:
`/blog/qa2-כתובת-חדשה-אחרי-שינוי`. The previewed URL 404s — I hit this myself before finding
the real link on the blog index. Anyone copying the previewed address gets a dead link.

### R2-3 · A bare URL still becomes a link — LOW
X-7 claims "she cannot author a link". Markdown link *syntax* is now neutralised, but GFM
autolinking still turns a bare `https://…` in body copy into a live `<a href>`; the published
test post contains a working anchor to `example.com`. Not the R-2 class of defect, and
arguably desirable behaviour — but the guarantee as written is still not literally true.

### R2-4 · The publish message counts actions, not changes — LOW
`publishMessage` folds the draft's commit *subjects*. My session's publish produced:

> `פרסום ממערכת הניהול: 14 שינויים`

for **3** net files, listing pairs that cancelled out entirely (`הוספת תמונה…` + `מחיקת תמונה…`,
`שחזור דף הבית…` + `ביטול שחזור…`). For history the owner reads later, the net paths would be
truer than the action log.

### R2-7 · The status can still report the CMS's own deployment — MEDIUM
H-9's fix is incomplete. Querying the status of the revert commit `7b18217` returned:

```
state: ready
url:   https://shir-website-editor-7z3cjlqve-shiramitai1-3216s-projects.vercel.app
```

That is the **CMS project**, presented as the site's build state. Two guards were added and
both miss:

- `deployments.filter(d => d.environment.includes(project))` — `SITE_VERCEL_PROJECT` is
  optional and appears unset here; and GitHub's `environment` for Vercel deployments is
  normally `Production`/`Preview`, which would not contain a project name even if it were set.
  So `named` is empty and the code falls through to *all* deployments for the sha.
- The fallback then skips a deployment whose host equals `selfHost`, but `selfHost` is derived
  from the request host (`admin.shir-amitai.com`) while the CMS's own `environment_url` is a
  `*.vercel.app` preview host. The comparison never matches, so nothing is skipped.

It resolved correctly earlier in the run only because the site project had also deployed that
sha and happened to come first. The consequence is the run-1 defect in a narrower form: the
owner can be shown *"התצוגה מוכנה"* plus a link to the admin app instead of her site, and the
publish gate can unblock on the wrong project's build.

### R2-5 · Legal `updated` date uses UTC — LOW
The date is computed with `toISOString()`, so between midnight and 03:00 Israel time it writes
*yesterday*. Observed: editing the accessibility statement on 2026-09-23 wrote
`updated = "2026-09-22"`. Narrow, but it is a dated legal declaration.

---

## 4. Everything from run 1, re-tested

### Fixed and verified

| Run 1 finding | Status in run 2 | Evidence |
|---|---|---|
| **C-1** markdown injection → `<h1>`/links | **Fixed** | §2, production page: `h1count: 1` |
| **H-1** frontmatter newline folded | **Fixed** | block scalar `|-`; js-yaml keeps `\n` |
| **H-2 / X-9** no draft persistence | **Fixed** | `localStorage['shir-cms-drafts']` keyed by path + timestamp; `beforeunload` guarded; after a hard reload the app offers *"יש כאן שינויים שהתחלת ולא נשמרו · שחזור מה שכתבתי · להתחיל מהגרסה שבאתר"* — it does **not** silently substitute. Restore verified. |
| **H-3 / G-12** no restore UI | **Fixed** | Commits expand to their file list with *"החזרה לגרסה הזו"* and a Hebrew confirm. Restoring `home.toml` produced blob `96c81b8…` — **identical to the target blob**. |
| **H-4 / X-11** locks client-only | **Fixed (server)** | `assertLegal()` now runs `legalProblems(path, before, after, role)` server-side on every save of a legal file. |
| **H-5 / X-13** no balance enforcement | **Fixed at the boundary** | `bannerProblems()` runs server-side for all roles. Saving `accept = "כן, אני מסכימה בשמחה! (מומלץ)"` / `decline = "לא"` was **rejected** with the full Hebrew reason, and `consent.toml` was unchanged. *Residual:* the client still enables the button, so the failure arrives after a round trip instead of inline. |
| **H-6 / X-14 / A-10.5** banner ↔ terms unlinked | **Fixed** | Editing the banner surfaces the matching `מדידה וסטטיסטיקה` terms section **inline**, and blocks save until *"קראתי, והשניים אומרים את אותו הדבר"* is ticked. |
| **H-7 / A-4.8** no rename | **Fixed** (see R2-2) | *"שינוי הכתובת"* dialog with live slug preview. The write is **one commit**, git-detected as a pure rename (0 insertions / 0 deletions), content byte-preserved. |
| **H-8 / A-8.3** no nav reorder | **Fixed** | Per-row buttons labelled *"העברת «בלוג» למעלה"*. `nav.toml` diff is a clean block permutation with per-block alignment preserved. |
| **H-9** status showed the wrong project | **Partial — see R2-7** | Resolved correctly to the site project (`shir-amitai-mv1cmckdc-…`) once, but later returned the CMS's own deployment again. |
| **H-10** contrast below AA | **Fixed** | `.blurb` 3.69 → **5.42**; `.muted` 3.23 → **4.75**. Every token now passes its AA threshold. |
| **M-1** MDX comment as editable prose | **Fixed** | Now a *"📎 סימון פנימי TXT_ABOUT_OPENING"* chip; `PLACEHOLDER` no longer appears in the editable text. |
| **M-2** no `<h1>` anywhere | **Fixed** | Every screen swept has exactly one `<h1>` matching its title. |
| **M-3** blank therapy thumbnails | **Fixed** | All five modalities render real 400 px teaser derivatives. |
| **M-4** drawer not a modal | **Fixed** | `role="dialog"`, `aria-modal="true"`, body scroll locked, Escape closes, **focus returns to the hamburger**. |
| **M-5** nav rows indistinguishable | **Fixed** | Numbered per-row headings (`1. בית` … `10. יצירת קשר`), per-row checkbox and button names. *Residual:* the ten text inputs still share the bare label `הכיתוב`, resolved in practice by the headings. |
| **M-6** image delete = 2 commits | **Fixed** | One commit removing binary + manifest entry. Upload-then-delete netted to exactly zero. |
| **M-7** MDX EOF gained blank lines | **Fixed** | `about.mdx` EOF stays a single `\n`. |
| **M-8** client errors reported as "couldn't reach GitHub" | **Fixed** | `files: []` → `400 empty`; oversized upload → `413`. No longer 502/upstream. |
| **M-9** 1.09 MB single bundle | **Fixed** | Code-split into 19 chunks. Landing loads ~192 KB (entry 34 KB + react 142 KB + CSS 16 KB); the editor (376 KB) and vendor (476 KB) chunks load on demand. |
| **L-4** English commit subjects in history | **Fixed** | Translated to *"עדכון טכני של האתר"* / *"עדכון אוטומטי של גרסאות התמונות"*; no GitHub URL. *Residual:* author logins (`Itiel Beeri`, `github-actions[bot]`) are still Latin — unavoidable. |
| **L-8** hard-coded usage-scan list | **Fixed** | `referencingFiles()` enumerates collection dirs dynamically. Proved it: deleting `placeholder-ceremonies` was blocked naming *"עמוד טקסים"* — a modality that postdates the old list. |
| **L-9** full-size gallery thumbnails | **Fixed** | Now 640 px `_opt` derivatives, lazy-loaded. |
| **X-10** publish reachable before preview | **Fixed** | New `none`/`queued` states; publish disabled with *"אפשר לפרסם ברגע שהתצוגה מוכנה."* (See R2-6 for the cost.) |

### Still open

| # | Finding |
|---|---|
| **N-7** | The bar's `צפייה ופרסום` button is 40 px tall, under the 44 px minimum. Unchanged from run 1; every other control passes. |
| **X-13 residual** | Client-side inline validation for the consent banner is still missing — the button enables and the server rejects after a round trip. |
| **L-1 / L-6 / L-2** | Not re-exercised: empty commit-message tail for a decorative upload, `formatBytes` showing "0 KB" for sub-500-byte files, and the preview always opening the site's home page (L-2 needs a preview deployment — see §7). |

### Re-tested for regression — all still pass

Boundary: **B-1…B-4, B-8** (19 hostile paths, all `403`, none landed) · **B-9** (`401` for
start/save/publish without a cookie) · **B-12** (no secret-shaped strings in any chunk;
session cookie invisible to JS).

Write path: **G-1** (one commit per action, authored as the signed-in user, Hebrew subject) ·
**G-2 / G-3** (binary + manifest, screenshot + TOML block, each one commit) · **G-8** (session
start fast-forwarded `content-draft` from `39a94fb` to master — observed live) · **G-9** (two
concurrent saves both landed) · **G-11** (discard byte-identical to master).

Fidelity: **F-3 / F-17** (one value changed, alignment and `# PLACEHOLDER` comments intact) ·
**F-12 / F-13** (appends leave existing entries byte-identical) · **F-14** (reorder permutes
blocks, nothing inside changes) · **X-1** (hostile TOML with `"`, `"""`, `#`, `=`, newline and
U+200F round-trips exactly through `smol-toml`) · **X-2** (hostile YAML title escaped
correctly).

**F-9 / F-16 proved directly.** I injected an unmodelled key and a Hebrew maintainer comment
into `voice.mdx` via the API, then edited that file's body through the UI. Both survived
byte-for-byte — the serializer preserves what it does not model.

Acceptance: **A-1.1, A-1.2, A-1.3, A-1.6, A-1.7, A-2.1, A-2.3, A-2.4, A-3.1, A-3.2, A-3.3,
A-3.4, A-3.6, A-4.1, A-4.2, A-4.3, A-4.6, A-4.7, A-5.1, A-5.2, A-5.3, A-6.1, A-6.3, A-6.4,
A-7.1, A-7.2, A-7.3, A-7.4, A-8.1, A-8.2, A-8.4, A-9.4, A-10.1, A-10.2, A-10.3, A-10.6** and
**V-2**, **X-4**, **X-8**, **X-12**, **N-1** (no overflow at 320/759/1600), **N-4** (Hebrew
slugs), **N-6** (visible 2.4 px focus ring).

---

## 5. The publish path, end to end

Run 1 could not test this. Run 2 did, and it is the strongest result in the suite.

The draft was based on `5858e01`. While it was open, `16db1df` landed on master — an unrelated
commit touching `about.mdx`, `src/content/config.ts`, `src/pages/about.astro` and
`cms/src/model/screens.ts`. Publishing then:

- **G-4 —** applied **exactly** the three paths the draft had changed, and nothing else.
- **G-6 —** every byte of `16db1df` survived; `more_links` is still on master in all four files.
- **G-5 —** all **423** files under `public/img/_opt/` intact.
- The draft fast-forwarded onto the publish commit.

The merge-base measurement that protects the images bot demonstrably works against a real
concurrent commit, not just a unit test.

> **A correction to my own method.** Mid-run I reported that a body edit had deleted the
> `more_links` frontmatter field. That was wrong. The draft's `about.mdx` never contained the
> field — it was added to *master* by `16db1df` while my draft was open, and I had diffed
> against the moved tip. The CMS deleted nothing, which the F-9/F-16 injection test above
> then confirmed directly. Worth stating plainly because a "CMS eats your content" finding is
> exactly the kind that gets acted on before it is checked.
>
> This does surface a genuine design note, though: a long-lived draft holds an older copy of
> any file it has touched, and publish applies that copy over master's newer one for those
> paths. `ensureDraft` only fast-forwards when the draft has *nothing* pending, so the window
> stays open as long as the owner has unpublished work. It is inherent to the model and
> correct per G-4, but it is a real lost-update path worth documenting for the owner.

---

## 6. Acceptance matrix — run 2

`P` pass · `F` fail · `~` partial · `–` not exercised · `⊘` blocked by environment

| Ch. 1 | | Ch. 2 | | Ch. 3 | | Ch. 4 | | Ch. 5 | |
|---|---|---|---|---|---|---|---|---|---|
| A-1.1 | **P** | A-2.1 | **P** | A-3.1 | **P** | A-4.1 | **P** | A-5.1 | **P** |
| A-1.2 | **P** | A-2.2 | **P** | A-3.2 | **P** | A-4.2 | **P** | A-5.2 | **P** |
| A-1.3 | **P** | A-2.3 | **P** | A-3.3 | **P** | A-4.3 | **P** | A-5.3 | **P** |
| A-1.4 | **P**¹ | A-2.4 | **P** | A-3.4 | **P** | A-4.4 | **P** | A-5.4 | **P** |
| A-1.5 | ⊘ | A-2.5 | **P** | A-3.5 | ~ | A-4.5 | **P** | A-5.5 | **P** |
| A-1.6 | **P** | | | A-3.6 | **P** | A-4.6 | **P** | | |
| A-1.7 | **P** | | | | | A-4.7 | **P** | | |
| | | | | | | A-4.8 | ~² | | |
| | | | | | | A-4.9 | **P** | | |

| Ch. 6 | | Ch. 7 | | Ch. 8 | | Ch. 9 | | Ch. 10 | |
|---|---|---|---|---|---|---|---|---|---|
| A-6.1 | **P** | A-7.1 | **P** | A-8.1 | **P** | A-9.1 | ~ | A-10.1 | **P** |
| A-6.2 | **P** | A-7.2 | **P** | A-8.2 | **P** | A-9.2 | ⊘ | A-10.2 | **P** |
| A-6.3 | **P** | A-7.3 | **P** | A-8.3 | **P** | A-9.3 | **P** | A-10.3 | **P** |
| A-6.4 | **P** | A-7.4 | **P** | A-8.4 | **P** | A-9.4 | **P** | A-10.4 | – |
| A-6.5 | ~ | A-7.5 | ~ | A-8.5 | ~ | A-9.5 | ~ | A-10.5 | **P** |
| | | | | | | | | A-10.6 | **P** |

¹ Publish verified via the API; the UI button was blocked by R2-6.
² Rename works; the previewed URL is wrong-case (R2-2).

**Tally — 45 P · 0 F · 7 ~ · 1 – · 3 ⊘** (run 1: 34 P · 6 F · 15 ~ · 3 –)

### Guarantees

| | | | | | |
|---|---|---|---|---|---|
| X-1 **P** | X-2 **P** | X-3 – | X-4 **P** | X-5 **P** | X-6 **P** |
| X-7 ~ | X-8 **P** | X-9 **P** | X-10 **P** | X-11 **P**³ | X-12 **P** |
| X-13 **P** | X-14 **P** | X-15 **P** | X-16 ~ | R-1 **P** | R-2 **P** |

³ Server-side enforcement verified in code and exercised for the banner rules; the
owner-role path is untested (§7).

---

## 7. Not verified, and why

| Area | Reason |
|---|---|
| **A-10.4, X-11 owner half** | Needs an `owner` session; this run authenticated as `maintainer`, for whom the locks are intentionally open. The server-side rule exists and is role-aware; only the owner path is unexercised. |
| **A-1.5, A-9.2, L-2, preview iframe** | Vercel was rate-limiting; no deployment was created for any draft sha. Suspended at the user's request. |
| **Whether "ready" is ever reported prematurely** | Not established. My initial 404s after publishing were my own wrong-case URL (R2-2), not a stale build. Explicitly **not** claimed as a defect. |
| **`axe` (N-5)** | The CMS's own CSP (`script-src 'self'`) blocks loading axe-core. Substituted a manual audit: contrast ratios, accessible names, roles, focus, target sizes, heading structure — all reported above. |
| **N-16 / N-17 on 4G** | No throttling available. Chunk sizes reported instead; the split makes the ~2 s target plausible where the 1.09 MB bundle did not. |
| **X-3** | A 200-sequence fuzz campaign, not a browser task. F-18 remains unwritten per TEST-SPEC §4.1. |
| **B-10, B-11** | B-10 needs a second, non-allow-listed account. B-11 verified by code: the cookie is AES-256-GCM sealed, HttpOnly, Secure, SameSite=Lax, so tampering fails the auth tag. |

---

## 8. Repository state — reverted

Run 2 was authorised to publish. One publish reached production; the revert has now been
published as `7b18217 פרסום ממערכת הניהול: 5 שינויים`.

**Verified after the revert:**

```
git diff --name-status 16db1df origin/master -- src/content public/img
  (empty — content byte-identical to the pre-test baseline)
```

- `master` and `content-draft` are both at `7b18217`.
- No QA file remains in the tree; no QA string remains in any content file.
- The intervening work — `ea07374 post ordering ux` and its merge — is untouched.
- The revert applied exactly three paths: the test post deleted, `nav.toml` and
  `accessibility.toml` restored byte-identically from `16db1df`.

**One caveat:** because Vercel is rate-limited, the *deployed site* had not rebuilt at the time
of writing — `/blog/qa2-…` still returned 200 and the accessibility page still carried the test
sentence. The repository is correct; the site will match it on the next successful build. Worth
a glance once the limit clears.

Everything else is clean:

- `recommendations.toml` — discarded, byte-identical to master.
- `site.toml`, `about.mdx`, `voice.mdx`, `home.toml`, `404.toml`, `contact.toml` — all discarded
  and verified byte-identical to master.
- Both QA images uploaded during the run were deleted; upload + delete netted to zero.
- The injected `qa_unknown_field` test key was discarded.
- The working tree was never modified; no worktree remains.

The publish that landed the revert also re-confirmed **G-4** (three paths applied, nothing
else) and **G-6** (the intervening `ea07374` survived intact).

---

## 9. Suggested order of work

1. **R2-1** — give the unsaved-changes guard a voice. The app already has the right pattern on
   reload; reuse it: keep / discard / cancel. Silent blocking is the one behaviour to avoid.
2. **R2-6** — add a timeout and an override to the publish gate. After, say, 90 seconds
   without a deployment, fall back to run 1's honest wording rather than disabling publish
   outright. A rate limit should not stop the owner publishing.
3. **R2-7** — finish H-9. Match the site's deployment by its `environment_url` host (the
   site's domain) rather than by `environment`, and make the self-skip compare against the
   CMS project's `*.vercel.app` hosts too, not just its custom domain.
4. **R2-2** — lowercase the slug in the rename preview so it matches what the site serves.
5. **X-13 inline validation** — run `bannerProblems()` client-side too, so the owner sees the
   reason as she types instead of after a failed save.
6. **R2-5** — compute the legal `updated` date in Israel time, not UTC.
7. **R2-4** — build the publish subject from the net changed paths rather than the action log.
8. **N-7** — the 40 px bar button.
9. Re-run **A-10.4 / X-11** under an owner session and the deployment-dependent rows once
   Vercel recovers.
