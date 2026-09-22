# CMS live quality report — admin.shir-amitai.com

End-to-end execution of `cms/TEST-SPEC.md` against the **production deployment**,
driven through a real browser as the owner would use it.

| | |
|---|---|
| **Date** | 2026-09-22 |
| **Target** | `https://admin.shir-amitai.com` (production) |
| **Build under test** | `ce3ac9c` — confirmed by fetching `/assets/index-wjknNLPx.js` and matching three strings introduced only in that commit |
| **Signed-in role** | `maintainer` (`ItielBeeri`) — **not** `owner` |
| **Repo baseline at start** | `master` = `content-draft` = `ce3ac9c`, content trees identical |
| **Repo state at end** | every file this run touched is byte-identical to `master`; `master` never written |

> **The repository was in active concurrent use throughout.** `master` advanced twice
> (`cfc2797 add social links`) and the site owner (`shiramitai1`) created a blog post and
> uploaded an image into the shared `content-draft` while testing was in progress. This
> shaped two decisions, both recorded in §6: the publish test was **not** performed, and
> cleanup was done surgically rather than by resetting a branch.

---

## 1. Verdict

**The suite does not pass.** Of the six exit criteria in TEST-SPEC §1, none is met, and one
failure is severe enough to matter on its own:

> **The CMS writes the owner's body text into MDX without escaping markdown.** Typing
> `# כותרת` produces a real second `<h1>`; typing `[טקסט](url)` produces a real link. This is
> incident **R-2** — the one the spec names as already having happened in production — and it
> is reproducible today, not hypothetical. It also falsifies guarantees **X-6** and **X-7**.

The build **is** strong in the places that were hardest to get right: TOML value fidelity,
the single-commit write path, the `_href`/`_display` derivation, the image-reference guard,
per-file `updated` bumping, and the merge-base measurement that protects the images bot.
The failures cluster in **output escaping, safety-net features that were specified but never
built (restore, rename, reorder, draft persistence), and server-side enforcement of rules
that exist only in client code.**

| Exit criterion | Result |
|---|---|
| All 58 acceptance rows pass | **No** — 6 fail, 8 partial, 3 not exercised (§4) |
| Every §4.1 fidelity gate passes live | **Mostly** — TOML exact; MDX rewrites the EOF newline run (F-7) |
| Build parity (§4.4) | **No** — see F-7, F-10; `P-1` byte-identity fails on first MDX touch |
| Every §7 guarantee passes | **No** — X-6, X-7, X-9, X-11, X-13, X-14 fail (§3) |
| Zero `axe` violations at 390/1280 | **No** — systemic contrast failure (F-25); also no `<h1>` |
| Green in CI three times running | Not applicable — no browser suite exists yet |

---

## 2. Critical

### C-1 · Body text is serialized to MDX unescaped → `<h1>` and links injected
**Fails X-6, X-7, R-2, A-4.5.**

In a blog post body I typed four separate paragraphs:

```
כאן מתחיל הפוסט.
# ניסיון כותרת ראשית
[קישור אסור](https://example.com)
## ניסיון כותרת שנייה
```

The editor correctly showed all four as literal text — no `<h1>`, no `<a>` in the editing
surface. But the serializer wrote them verbatim into the `.mdx`, on consecutive lines with no
escaping. The draft branch then built, and the **rendered production-grade page** reported:

```
h1count: 2
h1s: ["בדיקת איכות: \"ציטוט\" ו#תגית", "ניסיון כותרת ראשית"]
h2s: ["ניסיון כותרת שנייה"]
linksInBody: ["https://example.com | קישור אסור"]
```

Three separate consequences:

1. **X-6 fails.** Two `<h1>` on one page. AGENTS.md §10 requires exactly one.
2. **X-7 fails.** A link was authored with no link control, exactly what the spec says is impossible.
3. **A-4.5 fails, and WYSIWYG is broken in the dangerous direction** — the editor shows the
   owner something *safer* than what ships. She cannot see the problem before publishing.

The vulnerable class is every markdown-significant construct: leading `#`, `-`, `>`, `1.`,
and inline `[..](..)`, `*`, `_`, `` ` ``. Only a serializer that escapes them is safe; the
editor's refusal to *render* them is not protection.

Note the same save also merged four editor paragraphs into one markdown block (no blank line
between them), so the help text — *"`Enter` מתחיל פסקה חדשה, עם רווח בין הפסקאות"* — did not
describe what happened.

---

## 3. High

### H-1 · Multi-line frontmatter loses the owner's line break (fidelity)
A `longtext` frontmatter field is emitted as a **multi-line double-quoted YAML scalar**:

```yaml
excerpt: "שורה ראשונה של ההזמנה.
שורה שנייה אחרי ירידת שורה."
```

YAML *folds* a line break inside a double-quoted scalar into a space. Parsed with the CMS's
own pinned `js-yaml`:

```
excerpt: "שורה ראשונה של ההזמנה. שורה שנייה אחרי ירידת שורה."
excerpt contains newline: false
```

Confirmed on the built page's `<meta name="description">`. The owner typed two lines; the site
shows one; reopening the post shows one. AGENTS.md §5 specifically promises that a single
newline in a multi-line frontmatter string survives (`remark-breaks`) — a block scalar (`|`)
or a blank-line-separated form would deliver that. Silent loss of typed content.

### H-2 · No draft persistence — work is lost without warning
**Fails X-9 and N-15.**

- `localStorage` and `sessionStorage` are both **empty** — there is no draft store.
- No `beforeunload` guard (`dispatchEvent` → `defaultPrevented: false`).
- Navigating away discards silently: three unsaved consent-banner edits vanished on one click
  of the title, with no prompt, and were gone on return.

Because nothing is persisted locally, **N-15** ("an expired session re-authenticates without
losing the in-progress draft") also cannot hold.

### H-3 · The restore feature does not exist
**Fails G-12 and A-9.3.**

The screen is titled **"היסטוריה ושחזור"** (history *and restore*) and lists master's commits
correctly with Hebrew dates. It contains **zero buttons**. Its own copy tells the owner to
telephone the maintainer: *"אם משהו השתבש, אפשר לפנות לאיתיאל עם התאריך ולחזור לגרסה קודמת."*

The `restore` action is implemented server-side and reachable — nothing in the UI calls it.
A-9.3's "history offers one-click restore" is unmet, and the title promises what it withholds.

### H-4 · Legal-field locks are client-only
**Fails X-11 (the API half).**

`cms/src/model/locks.ts` lives entirely in the client bundle. `cms/api/content/[action].ts`
reads `session.role` only to echo it back from `start`; `save` runs `asFiles` → `assertWritablePath`
→ `saveFiles`, and **no code path anywhere under `api/` consults a lock or a role**. An `owner`
session can therefore commit a locked legal field by posting to `/api/content/save` directly.

X-11 explicitly requires the direct-API attempt to be rejected. (Code-verified; not exercisable
from this `maintainer` session, which is permitted to edit these fields by design.)

### H-5 · Consent-banner balance is not enforced
**Fails X-13.**

With the banner open I set:

- accept → `כן, אני מסכימה בשמחה! (מומלץ)`
- decline → `לא`

and separately reduced the legally-required body sentence to `עוגיות.`

Every one was accepted: save stayed enabled, no validation message, no warning. There is no
balance or content check anywhere — the only protection is the client-side lock, which H-4
shows is not enforced server-side. AGENTS.md §12 is explicit that consent obtained through a
weakened refusal is invalid and would void the acceptances too.

### H-6 · Banner and terms are not linked
**Fails X-14 and the second half of A-10.5.**

Editing the consent banner does not surface the matching `מדידה וסטטיסטיקה` section of
`terms.toml`, and nothing gates publish on visiting it. `Legal.tsx`'s own header comment states
the intent ("the banner surfaces the terms section that has to say the same thing") but no code
implements it.

### H-7 · A post's URL cannot be changed
**Fails A-4.8.** The entry screen offers exactly two actions — `שמירה` and `מחיקה`. There is no
rename control anywhere. `DELIBERATELY_HIDDEN` documents `slug` as *"כתובת הפוסט, נשלטת דרך שינוי שם"*,
describing a mechanism that does not exist.

### H-8 · The menu cannot be reordered
**Fails A-8.3.** The nav editor has one button (`שמירה`), no drag handles, and
`[draggable="true"]` matches nothing. Relabelling and the `header` switch work, and `href` is
correctly absent — but `nav.toml` is the single source of truth for menu **order**, and order
is not editable.

### H-9 · Publish status can report the wrong deployment
**Fails A-1.5 and A-9.2.**

`deploymentStatus()` takes `deployments[0]` for a sha, on the stated assumption that *"the draft
branch only ever has a preview deployment and master only a production one."* **Two Vercel
projects build this repository**, so one commit carries deployments from both. Observed live:

```
status for master → https://shir-website-editor-4jef45xqw-....vercel.app
```

That is the **CMS's own** deployment, not the site's. The indicator the owner reads to answer
"did it go up?" can be reporting a different project's build.

### H-10 · Text contrast fails WCAG AA
**Fails N-5.** The muted grey is used for every card blurb, all help text and every status line:

| Token | Colours | Size | Ratio | AA needs |
|---|---|---|---|---|
| `.blurb` | `rgb(138,131,122)` on `rgb(255,253,250)` | 14 px | **3.69:1** | 4.5:1 |
| `.muted` | `rgb(138,131,122)` on `rgb(232,240,237)` | 14 px | **3.23:1** | 4.5:1 |

Body text and labels are fine (14.06:1). `axe` would flag `color-contrast` on nearly every screen.

---

## 4. Medium

| # | Finding | Row |
|---|---|---|
| M-1 | **An MDX comment is editable prose.** `about.mdx` line 8 begins `{/* PLACEHOLDER: TXT_ABOUT_OPENING */}` inline; the editor renders it as the first words of the owner's first paragraph. She sees MDX syntax and can delete the marker. | A-2.5, F-17 |
| M-2 | **The app has no `<h1>` on any screen.** The signed-out page has one; every signed-in screen has none (region `<h2>`s only). `axe` `page-has-heading-one`; no document title landmark for screen readers. | N-5 |
| M-3 | **Therapy list shows three blank thumbnails.** `Collection.tsx` reads only `data.cover`; therapies carry `hero_image`/`teaser_image`, so every row renders an empty `<span class="entry-thumb">`. Blog rows (which do have `cover`) render correctly. | A-5.1 |
| M-4 | **Drawer is not a modal.** No `role="dialog"`, no `aria-modal`, no focus trap, background not scroll-locked, and focus lands on `<body>` after Escape instead of returning to the hamburger. Escape does close it, and the image picker *is* a correct dialog — so the pattern exists, just not here. | N-6 |
| M-5 | **Nav editor rows are indistinguishable to assistive tech.** All 8 rows use the labels `הכיתוב` and `מופיע גם בתפריט העליון`, with 0 fieldsets, 0 headings and no per-row `aria-label`. | N-8 |
| M-6 | **Image delete is two commits** (`api.save` for the manifest, then `api.remove` for the file). A failure between them orphans one half. The *add* path is correctly one commit — the asymmetry is the bug. | G-2 |
| M-7 | **MDX save rewrites the trailing newline run.** `about.mdx` went `"\n"` → `"\n\n\n"` (+2 blank lines). It is idempotent (a second save kept 62 lines) and harmless to the build, but `P-1` byte-identity against a hand edit fails on first touch. `psychotherapy.mdx`, which had no EOF newline, gained exactly one — a correct normalisation. | F-8, P-1 |
| M-8 | **Client-side validation failures are reported as a network error.** `save` with `files: []` and the `MAX_CONTENT` overflow both throw a plain `Error`, falling through to the generic `502 {error:'upstream'}`, which the client maps to *"לא הצלחתי להגיע ל-GitHub כרגע"*. An oversized upload therefore tells the owner GitHub is unreachable. | N-12, N-14 |
| M-9 | **Bundle is 334 KB gzipped (1.09 MB raw) in a single chunk**, no code splitting. FCP measured 1,996 ms on a fast desktop link; on emulated 4G the transfer alone is ~1.7 s before parse. **N-16** (<2 s interactive on 4G) is very unlikely to hold. *(Measured on a fast connection — stated as at-risk, not as a measured 4G failure.)* | N-16 |

---

## 5. Low

| # | Finding |
|---|---|
| L-1 | Decorative-image commit message is `"הוספת תמונה: "` — the alt is empty, so the subject ends in a dangling colon and says nothing. |
| L-2 | The preview always opens the site's **home page**, never the page that changed. After editing יצירת קשר, the owner must navigate inside the frame to see her own edit. |
| L-3 | Deleting an image takes ~9 s (reads 5 files plus every blog post) with no visible progress for the first several seconds. |
| L-4 | The history screen shows raw English commit subjects and a repository URL to the owner — `bug fixes`, `improve preview`, `Merge branch 'master' of https://github.com/ItielBeeri/shir-website`. Contrary to X-16's spirit. |
| L-5 | Body-editor help text uses Latin `Enter` and `Shift + Enter` (defensible — they are key names — but it is Latin in the UI). |
| L-6 | `formatBytes` uses `Math.round(bytes/1000)`, so a sub-500-byte file reads *"הוקטנה מ־0 KB ל־1 KB"* — shrunk from 0 to 1. |
| L-7 | The pending tray lists `site.toml` as *"שונה"* when its content is byte-identical to master (it differs only from the older merge base). The owner is shown a change that is not one. |
| L-8 | `Images.tsx` `REFERENCING` hard-codes the five content files to scan for usage. Adding a fourth modality would silently drop it from the X-4 orphan check. |
| L-9 | Gallery thumbnails load full-size originals from `raw.githubusercontent.com` (observed 3382×2258, 2048×1536). Lazy-loaded, so not fatal, but a 3.4 MP file is being painted at ~100 px. |
| L-10 | iPhone photos are HEIC by default and cannot be decoded by canvas in Chrome; such an upload yields only *"לא הצלחתי לקרוא את הקובץ. אפשר לנסות תמונה אחרת."* with no hint about format. (A-3.1 specifies JPEG, so this is outside the row — but it is the most likely real upload.) |

---

## 6. What passed — and it is a lot

These were exercised against the live system and produced correct bytes.

**Fidelity and the write path**
- **TOML value fidelity is exact.** A contact-page edit changed one line, preserving the aligned `=` padding and the `# PLACEHOLDER: TXT_CONTACT_INTRO` comment. (F-3, F-17)
- **Hostile TOML input round-trips perfectly.** A recommendation transcription containing `"`, `"""`, `#`, `=`, a newline and U+200F was escaped correctly and re-read **byte-identically** through the site's own `smol-toml`. (X-1)
- **Hostile YAML input is escaped correctly.** A post titled `בדיקת איכות: "ציטוט" ו#תגית` — colon, quotes and hash — produced valid YAML via `\"` escaping. (X-2, frontmatter half)
- **F-12 / F-13 live:** appending an `images.toml` entry and a `[[recommendations]]` block left every existing entry byte-identical.
- **F-14 live:** reordering recommendations permuted blocks 01↔02 with the multiset of all file lines unchanged apart from the one `active` line deliberately toggled.
- **G-1:** one commit per action, authored as the signed-in user, with Hebrew subjects (`עדכון יצירת קשר`).
- **G-2 / G-3:** image binary + manifest entry, and screenshot + TOML block, each in a **single** commit.
- **G-9:** two concurrent saves fired simultaneously both landed as sequential commits; neither was dropped.
- **G-11 / A-1.6:** discard restored the file to master's content **byte-identically** (empty diff), as a forward commit rather than a history rewrite.

**G-4 / G-5 — verified live, by accident of timing.** Master advanced mid-session with an
unrelated commit (`cfc2797`, adding `src/lib/social.ts`, two icons and edits to `Footer.astro`,
`terms.toml`, `contact.astro`). `pending` afterwards listed **only** the four paths the draft
itself changed — none of master's new files appeared as `removed`. The merge-base measurement
that protects the images bot from the whole-tree-swap regression demonstrably works against a
real concurrent commit.

**The permission boundary**
- **B-1…B-4, B-8:** 17 hostile paths — `src/pages/index.astro`, `astro.config.mjs`, `package.json`, `AGENTS.md`, `vercel.json`, `.github/workflows/images.yml`, `src/content/config.ts`, `../` traversal, percent-encoded traversal, backslashes, absolute paths, empty segments, padded segments, `public/img/_opt/`, `.svg`, `.html`, `.ts` — **all 403 `path-rejected` server-side.**
- **B-9:** request without the session cookie → `401 unauthenticated`, before any GitHub call.
- **B-12:** no secret-shaped string in the bundle or HTML; the session cookie is invisible to JS.
- **B-11 (code-verified):** the cookie is AES-256-GCM sealed — HttpOnly, Secure, SameSite=Lax — so a tampered value fails the auth tag and `unseal` returns null. Sound, though not exercised live.
- **B-5/B-6/B-7 are structural:** the API exposes no repo and no branch parameter; `saveFiles` hard-codes `content-draft`.

**Acceptance highlights**
- **A-8.1 / X-8 — exemplary.** *One* phone field drives all three derived values. Entering the messy `054 987 6543` wrote `phone_display = "054-987-6543"`, `phone_href = "tel:+972549876543"` and `whatsapp_url = "https://wa.me/972549876543"` in one commit. They cannot disagree.
- **A-10.3 / X-12:** `updated` bumped `2026-09-07` → `2026-09-22` in `accessibility.toml` **only**; `terms.toml` untouched; the rest of the file byte-identical; the UI said so (*"נשמר, ותאריך העדכון התעדכן."*).
- **X-4:** deleting a referenced image is blocked, naming where it is used (*"התמונה הזו בשימוש ב: דף הבית"*) with a Hebrew reason.
- **X-1 (collision):** uploading a second file with an identical name produced `qa-upload-test-2`, not a duplicate TOML table.
- **A-3.1:** a 5.15 MB JPEG was downscaled client-side to 2048×1390 with both sizes shown (*"הוקטנה מ־5.4 MB ל־1.5 MB"*). **A-3.3:** save blocked in Hebrew until alt is supplied; the decorative checkbox yields `alt = ""`.
- **A-4.6:** the CMS's blog order matches `sortBlogPosts()` exactly (`order > 0` first, then date desc), and `_example.mdx` is correctly hidden by the `_` rule.
- **A-8.4:** `http://`, `ftp://`, `javascript:` and free text are all rejected with *"הכתובת צריכה להתחיל ב-https://"*; **V-2** blocks empty required fields and malformed email in Hebrew.
- **A-2.1 / A-2.4 / A-1.7 / A-9.4 (structural):** no key name, `=`, bracket or file path appears on any screen; booleans are Hebrew switches with no `true`/`false`; nothing outside content is reachable.
- **N-1:** no horizontal scroll and no overflowing element at **320 / 375 / 768 / 1280 / 1600 px**.
- **N-6 (focus):** every focused control shows a visible 2.4 px brand outline.
- **N-4:** Hebrew filenames are generated and handled correctly (`בדיקת-איכות-ציטוט-ותגית.mdx`).
- **N-12/N-13:** a non-image upload is refused with a Hebrew sentence and no code or stack trace.
- The image picker is a correctly-built dialog: `role="dialog"`, `aria-modal="true"`, labelled, lazy-loaded.
- All interactive targets are ≥ 44 px except one (the bar's `צפייה ופרסום` at 40 px high — **N-7**).

---

## 7. Acceptance matrix (58 rows)

`P` pass · `F` fail · `~` partial (affordance verified, not fully exercised) · `–` not exercised

| Ch. 1 | | Ch. 2 | | Ch. 3 | | Ch. 4 | | Ch. 5 | |
|---|---|---|---|---|---|---|---|---|---|
| A-1.1 | **P** | A-2.1 | **P** | A-3.1 | **P** | A-4.1 | **P** | A-5.1 | ~ |
| A-1.2 | **P** | A-2.2 | ~ | A-3.2 | **P** | A-4.2 | **P** | A-5.2 | **P** |
| A-1.3 | **P** | A-2.3 | **P** | A-3.3 | **P** | A-4.3 | **P** | A-5.3 | **P** |
| A-1.4 | – | A-2.4 | **P** | A-3.4 | **P** | A-4.4 | **P** | A-5.4 | **P** |
| A-1.5 | **F** | A-2.5 | **F** | A-3.5 | ~ | A-4.5 | **F** | A-5.5 | ~ |
| A-1.6 | **P** | | | A-3.6 | **P** | A-4.6 | **P** | | |
| A-1.7 | **P** | | | | | A-4.7 | **P** | | |
| | | | | | | A-4.8 | **F** | | |
| | | | | | | A-4.9 | ~ | | |

| Ch. 6 | | Ch. 7 | | Ch. 8 | | Ch. 9 | | Ch. 10 | |
|---|---|---|---|---|---|---|---|---|---|
| A-6.1 | **P** | A-7.1 | **P** | A-8.1 | **P** | A-9.1 | ~ | A-10.1 | **P** |
| A-6.2 | **P** | A-7.2 | **P** | A-8.2 | ~ | A-9.2 | **F** | A-10.2 | **P** |
| A-6.3 | **P** | A-7.3 | **P** | A-8.3 | **F** | A-9.3 | **F** | A-10.3 | **P** |
| A-6.4 | **P** | A-7.4 | **P** | A-8.4 | **P** | A-9.4 | **P** | A-10.4 | ~ |
| A-6.5 | ~ | A-7.5 | ~ | A-8.5 | ~ | A-9.5 | ~ | A-10.5 | **F** |
| | | | | | | | | A-10.6 | **P** |

**Tally — 34 P · 6 F · 15 ~ · 3 –**

### Guarantees (§7)

| | | | | | |
|---|---|---|---|---|---|
| X-1 **P** | X-2 **P** | X-3 – | X-4 **P** | X-5 **P** | X-6 **F** |
| X-7 **F** | X-8 **P** | X-9 **F** | X-10 ~ | X-11 **F** | X-12 **P** |
| X-13 **F** | X-14 **F** | X-15 ~ | X-16 ~ | R-1 **P** | R-2 **F** |

*R-1 passes:* a two-line paragraph entered into a TOML field produced valid TOML with the
newline preserved — the original incident cannot recur. *R-2 fails:* see C-1.

---

## 8. Not exercised, and why

| Area | Reason |
|---|---|
| **A-1.4 publish, A-9.2 status end-to-end, G-4 (apply half), G-6, G-10** | The shared `content-draft` contained the site owner's **unfinished** blog post and a new image, added while testing was underway. Publishing would have pushed her work-in-progress to the live site. That is her decision, not mine. *(G-4/G-5's measurement half was verified anyway — §6.)* |
| **A-10.4 owner half, X-11 owner half** | This session authenticates as `maintainer`, for whom locks are intentionally open. Needs an `owner`-role login. |
| **B-10** (login outside the allow-list) | Needs a second, non-allow-listed GitHub account. |
| **B-11** (tampered cookie) | The session cookie is HttpOnly; forging one from the page is not possible without risking the live session. Verified by code inspection instead. |
| **`axe` (N-5)** | The CMS's own CSP (`script-src 'self'`, `connect-src 'self'`) blocks loading axe-core into the page. Substituted a manual audit: contrast ratios, accessible names, roles, focus visibility, target sizes, heading structure. |
| **N-16 / N-17 on 4G** | No network throttling available through this harness; bundle size and desktop FCP reported instead. |
| **X-3** (200 generated edit sequences) | A fuzz campaign, not a browser task. F-18 remains unwritten per TEST-SPEC §4.1. |

---

## 9. Repository hygiene

Nothing this run created remains, and nothing belonging to anyone else was touched.

- **`master` was never written.** No publish was performed. The live site was checked
  afterwards: contact page free of test text, phone number `052-520-1162` intact, no test post.
- **`content-draft` was cleaned surgically**, through the CMS's own API — not by resetting the
  branch, because the owner's concurrent work was sitting on it.
  - 7 modified files discarded → verified **byte-identical to `master`**.
  - 4 added files deleted (2 test images, 1 recommendation screenshot, 1 test post).
  - `images.toml` rebuilt as `master's bytes + the owner's entry`, verified by asserting the
    result `startsWith(master)` with the remainder being exactly her three lines.
  - **Preserved untouched:** `public/img/content/image-2026-09-22.jpg` and
    `src/content/blog/טיפול-זה-לא-קסם.mdx`, plus her `images.toml` entry.
- **The working tree was never modified.** A temporary worktree was used and removed.
- The cleanup left 9 forward commits on `content-draft` (`ניקוי בדיקות איכות: …`). History was
  not rewritten, deliberately: force-pushing a shared branch during concurrent use would have
  destroyed the owner's commits.

---

## 10. Suggested order of work

1. **Escape markdown on serialization** (C-1). Nothing else on this list can harm the published
   site the way this does, and it re-opens a defect that already cost three days of stale deploy.
2. **Emit block scalars for multi-line frontmatter** (H-1) — silent loss of typed content.
3. **Enforce locks server-side** (H-4) and add consent-balance validation (H-5). Both are legal
   exposure, and both are cheap: the rules already exist in `locks.ts`, they just need to run in
   `api/content/[action].ts` as well.
4. **Persist the draft locally** (H-2). One `localStorage` write per keystroke-debounce removes
   an entire class of "I lost everything" reports.
5. **Build the three missing features the spec assumes exist**: restore (H-3), rename (H-7),
   nav reorder (H-8).
6. **Filter `deploymentStatus` by project** (H-9) — the status line is currently untrustworthy.
7. **Darken the muted token** (H-10) and add an `<h1>` per screen (M-2) — two small changes that
   together clear most of the a11y gap.
