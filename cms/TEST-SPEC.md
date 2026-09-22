# CMS test specification

What must pass before `cms/` replaces `vscode.dev` as the owner's editing
surface, and `editor-guide/` is retired.

Design decisions live in `log/cms-plan.md`; repo rules in `AGENTS.md` §13.

---

## 1. The claim under test

> Every content action the owner performs today can be performed in `cms/`,
> produces a site byte-identical to what a hand edit would produce, cannot
> corrupt the repository or the build, and needs no guide to discover.

Four clauses, four distinct kinds of evidence. A green browser suite proves the
third and fourth only; on its own it would let the CMS ship while silently
reflowing her prose. Hence the layers in §3.

**Exit criteria.** All of:

- Every test in the §6 acceptance matrix passes - all 58 rows.
- Every fidelity gate in §4.1 passes against the live content files.
- The parity test (§4.4) passes: CMS-authored and hand-authored content build
  to identical `dist/` output.
- Every guarantee in §7 passes, including the two regression scenarios from
  real incidents (§7.4).
- Zero `axe` violations on every CMS screen at 390 px and 1280 px (§8.2).
- The suite runs green in CI three consecutive times (no flake budget).

Until all six hold, `editor-guide/` stays published and `vscode.dev` stays the
documented fallback.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **fidelity** | An edit changes what it must and not one byte more |
| **parity** | The site built from CMS output is indistinguishable from the site built from a hand edit |
| **guarantee** | A claim of the form "she cannot X"; tested by attempting X and requiring failure |
| **acceptance** | One row of the editor guide, performed as the owner would |
| **sacrificial repo** | A throwaway GitHub repo the write-path tests may freely corrupt |

---

## 3. Layers

| Layer | Question it answers | Tool | Speed |
|---|---|---|---|
| **L0 Fidelity** | Does a write preserve everything it should? | Vitest | ms |
| **L1 Contract** | Does the CMS's model still match the site's schema? | Vitest | ms |
| **L2 Write path** | Do commits, branches and publishes do the right thing to a real repo? | Vitest + sacrificial repo | seconds |
| **L3 Flows** | Does a whole task work in a browser? | Playwright | seconds |
| **L4 Acceptance** | Can the owner do all 58 things? | Playwright | minutes |
| **L5 Guarantees** | Are the safety claims true? | Vitest + Playwright | seconds |
| **L6 Non-functional** | RTL, Hebrew, a11y, mobile, errors, performance | Playwright + axe | minutes |

L0 and L1 gate every commit. L2-L6 gate a release.

---

## 4. L0/L1 - fidelity and contract

### 4.1 Round-trip gates (implemented)

`src/content/toml-edit.test.ts` · `src/content/mdx-edit.test.ts`

Run against the **live** content files, never fixtures - that is why `cms/`
lives in this repo. A quoting style or comment added to the site is covered the
moment it lands.

| ID | Assertion |
|---|---|
| F-1 | Every TOML value, rewritten to itself, reproduces the file byte-for-byte - all at once and one at a time |
| F-2 | Enumerated TOML values equal what `smol-toml` parses, at the same paths |
| F-3 | A real TOML edit changes one value and leaves comment count and line count untouched |
| F-4 | Hebrew comments survive an edit to the same file |
| F-5 | A basic string gains a newline → promoted to `"""`, still parses |
| F-6 | A value containing `"` is escaped without breaking the document |
| F-7 | Every MDX file segments with no gaps; serializing reproduces it exactly |
| F-8 | Every editable block re-serializes byte-identically, including with **all** blocks marked changed |
| F-9 | Frontmatter is preserved verbatim, fences included |
| F-10 | `*` emphasis and `_` italic are distinguished by source marker (§4.3) |
| F-11 | Editing one paragraph leaves block count and every opaque block unchanged |

**Extensions still required:**

| ID | Assertion |
|---|---|
| F-12 | Appending an `images.toml` entry leaves all existing entries and both header comments byte-identical |
| F-13 | Appending a `[[recommendations]]` block leaves existing blocks byte-identical |
| F-14 | Reordering recommendations permutes blocks and changes nothing inside any block |
| F-15 | Deleting a recommendation removes exactly its block and its blank-line separator |
| F-16 | A frontmatter field edit leaves every other field, comment and line break in the frontmatter untouched |
| F-17 | Every `PLACEHOLDER` marker present before an edit is present after it |
| F-18 | Fuzz: 500 random values (Hebrew, emoji, quotes, newlines, `#`, `=`, `[`, `"""`, RTL marks, 10 KB strings) written to every slot in every file → the file still parses and the value reads back exactly |

F-18 is the cheapest insurance in the suite. The live incident (§7.4) was a
newline in a basic string; a fuzzer finds that class in seconds.

### 4.2 Content model parity

| ID | Assertion |
|---|---|
| C-1 | Every key in every live TOML file is known to the CMS content model |
| C-2 | Every key the model declares exists in the live files (no phantom fields) |
| C-3 | Every field in `src/content/config.ts` (`therapies`, `blog`, `about`) is in the model, with a matching type and required-ness |
| C-4 | The model's `accent` / `related_therapy` enums equal the Zod enums |
| C-5 | Every `images.toml` id referenced by any content file exists; every `screenshot` path exists on disk |
| C-6 | Every Hebrew label and help string in the model is non-empty and contains no Latin outside the §1 allowances |

C-3 is parsed out of `config.ts` with the TypeScript compiler API - it imports
`astro:content`, a virtual module the CMS cannot resolve.

### 4.3 Validation mirrors the site

| ID | Assertion |
|---|---|
| V-1 | For each collection, a valid CMS payload passes the site's Zod schema |
| V-2 | For each required field, an empty value is rejected **by the CMS** before any commit is attempted |
| V-3 | A date is emitted as `YYYY-MM-DD` and parses via `z.coerce.date()` |
| V-4 | `order` rejects zero, negatives and non-integers (schema says positive int) |
| V-5 | Tags and `relatedTherapies` reject values outside their enums |

### 4.4 Build parity - the strongest single test

| ID | Assertion |
|---|---|
| P-1 | For each of ~12 representative changes (one per content file, plus a new post, a new image, a new recommendation): apply via the CMS's write functions to a clean checkout, and apply the same change by direct file edit → the two files are byte-identical |
| P-2 | For three of those, run `pnpm build` on both trees → every file in `dist/` is byte-identical |
| P-3 | `pnpm check` and `pnpm build` pass on every CMS-authored tree |

P-2 is what licenses the phrase "nothing changes in the website stack". It is
slow; run it nightly and pre-release, not per commit.

---

## 5. L2 - the git write path

### 5.1 Environment

Write-path tests never touch `ItielBeeri/shir-website`. They run against a
**sacrificial repo** seeded from a pinned commit of it, recreated per run, with
its own GitHub App installation. Credentials come from CI secrets; a test run
that cannot find them **fails** rather than skipping, so the layer can never
silently go dark.

### 5.2 Assertions

| ID | Assertion |
|---|---|
| G-1 | A save creates exactly one commit on `content-draft`, authored as the signed-in user |
| G-2 | An image upload commits the binary **and** its `images.toml` entry in one commit - never two |
| G-3 | A recommendation commits screenshot + TOML block in one commit |
| G-4 | Publish applies **only** the paths the draft changed, onto master's current tree |
| G-5 | With a derivative commit pushed to `public/img/_opt/` on master mid-session, publish **preserves** it (the whole-tree-swap regression) |
| G-6 | With master advanced by an unrelated commit, publish rebases cleanly and loses nothing |
| G-7 | Head SHA is re-read immediately before every write; a stale-SHA write is retried, not lost |
| G-8 | Session start fast-forwards `content-draft` from `master` |
| G-9 | Two concurrent saves from two tabs both land; neither is silently dropped |
| G-10 | A failed publish leaves master untouched and the draft intact |
| G-11 | Discarding a draft change restores the file to master's content exactly |
| G-12 | History lists commits with Hebrew descriptions; restoring returns the file to a prior blob byte-exactly |

### 5.3 The permission boundary

Tested against the **real** proxy, not a mock - it is the permission model.

| ID | Attempt | Required outcome |
|---|---|---|
| B-1 | Write `src/pages/index.astro` | rejected server-side |
| B-2 | Write `astro.config.mjs`, `package.json`, `AGENTS.md`, `vercel.json` | rejected |
| B-3 | Write `.github/workflows/images.yml` | rejected |
| B-4 | Write `src/content/config.ts` | rejected |
| B-5 | Write outside the repo (another repo, same token) | rejected |
| B-6 | Push to `master` directly, bypassing publish | rejected |
| B-7 | Push to any branch other than `content-draft` / `master` | rejected |
| B-8 | Path traversal: `src/content/../../etc/passwd`, encoded variants, `\` separators | rejected |
| B-9 | Request with no session cookie | 401, no GitHub call made |
| B-10 | Session for a GitHub login outside the allow-list | 403 |
| B-11 | Tampered / re-signed session cookie | rejected |
| B-12 | Token is never present in any response body, HTML, or client bundle | absent |

B-12 runs as a build-artifact grep too: no secret-shaped string in `dist/`.

---

## 6. L4 - the acceptance matrix

The definition of "fully replaces". One row per editor-guide question. Each
row is performed **as the owner would** in a browser, starting from the landing
screen, with no knowledge of files.

Rows marked **structural** retire a question by making it unaskable; the test
asserts the absence of the concept rather than a user action.

### Chapter 1 - איך עובדים (7)

| ID | Retires | Test |
|---|---|---|
| A-1.1 | 1.1 how do I get in | From a cold browser: one visible button → GitHub → back, signed in. No token, URL or code ever typed |
| A-1.2 | 1.2 how do I find the file | Every one of the 12 landing tasks reachable in ≤ 2 taps. **Structural:** no screen contains a path, extension or tree |
| A-1.3 | 1.3 how do I change text | Change one sentence on יצירת קשר, save, see it confirmed |
| A-1.4 | 1.4 how do I publish | Publish and reach the "פורסם" state |
| A-1.5 | 1.5 how long until I see it | The status shown matches real deployment state, including while building |
| A-1.6 | 1.6 cancel an unpublished change | Discard restores the previous text with no residue (see G-11) |
| A-1.7 | 1.7 what must I not touch | **Structural:** nothing outside content is reachable in the UI at all (see B-1…B-8) |

### Chapter 2 - כללי הכתיבה (5) - all structural

| ID | Retires | Test |
|---|---|---|
| A-2.1 | 2.1 what may I change in a line | No key name, `=`, or quote mark appears in any screen's rendered text |
| A-2.2 | 2.2 long text | A multi-paragraph field is edited with no delimiter visible; `"""` is chosen by the writer, not the owner |
| A-2.3 | 2.3 how lists work | Add, remove and reorder a list item by UI; no bracket or comma visible |
| A-2.4 | 2.4 true and false | Every boolean is a labelled Hebrew switch; the words `true`/`false` never appear |
| A-2.5 | 2.5 lines starting with # | Owner comments are never rendered and always preserved (see F-4) |

### Chapter 3 - תמונות (6)

| ID | Retires | Test |
|---|---|---|
| A-3.1 | 3.1 upload an image | Pick a 6 MB JPEG → downscaled client-side, size shown before and after, one commit |
| A-3.2 | 3.2 register it in the list | **Structural:** registration is not a step. The id is generated; the owner never sees or types it |
| A-3.3 | 3.3 what to write in alt | Save is blocked with a Hebrew reason until alt is provided; "זו תמונת קישוט" yields `alt = ""` |
| A-3.4 | 3.4 use an existing image | A visual picker; selection is by thumbnail, never by id |
| A-3.5 | 3.5 replace an existing image | Replace in place; every referring page still resolves |
| A-3.6 | 3.6 image not showing | **Structural:** unreachable. A broken reference cannot be authored (see C-5); the picker offers only existing images |

### Chapter 4 - בלוג (9)

| ID | Retires | Test |
|---|---|---|
| A-4.1 | 4.1 add a post | Wizard start → finish; no template copied, no filename typed |
| A-4.2 | 4.2 fill the details | All frontmatter fields via labelled Hebrew inputs; `---` fences never seen |
| A-4.3 | 4.3 cover image | Chosen from the picker; written as an id |
| A-4.4 | 4.4 image in body | Inserted as a block with visual shape and side controls; emits a valid `SoftImage` |
| A-4.5 | 4.5 headings and paragraphs | Each of the 8 constructs in §4 of the plan produces exactly its markdown; **no h1, no link, no h4 control exists** |
| A-4.6 | 4.6 post order | Drag to pin; resulting order matches `sortBlogPosts()` exactly (asserted against the real function) |
| A-4.7 | 4.7 hide a post | Switch → `draft: true`; post leaves the index |
| A-4.8 | 4.8 change a post's URL | Rename; old and new slug behaviour matches the site's routing |
| A-4.9 | 4.9 delete a post | Confirm-guarded; file removed, nothing else touched |

### Chapter 5 - עמודי הטיפולים (5)

| ID | Retires | Test |
|---|---|---|
| A-5.1 | 5.1 where is each therapy | Three cards on one screen |
| A-5.2 | 5.2 the top of the file | Fields as labelled inputs; **`accent` is not present in the UI** |
| A-5.3 | 5.3 edit the body | Same editor as a post; round-trip holds (F-8) |
| A-5.4 | 5.4 embed an image | As A-4.4 |
| A-5.5 | 5.5 therapy order | Drag; low-number-first matches the site's sort. Asserts the guide's inverted-vs-blog trap is gone |

### Chapter 6 - עמודי האתר (5)

| ID | Retires | Test |
|---|---|---|
| A-6.1 | 6.1 edit home | All four regions editable; each field labelled and previewed |
| A-6.2 | 6.2 edit about | Frontmatter + body; portrait via picker |
| A-6.3 | 6.3 edit contact | Two regions. **Structural:** contact details are *not* here - a pointer to A-8.1 is |
| A-6.4 | 6.4 the 404 page | Editable under advanced; `href` fields absent |
| A-6.5 | 6.5 add an item to a list | Add a qualification to about; order in UI equals order on the page |

### Chapter 7 - המלצות (5)

| ID | Retires | Test |
|---|---|---|
| A-7.1 | 7.1 add a recommendation | Drop screenshot + paste text → one commit. **`id` and `screenshot` are derived**, so the guide's build-breaking mismatch cannot occur |
| A-7.2 | 7.2 their order | Drag; rendered order equals file order (`loadRecommendations` does not re-sort) |
| A-7.3 | 7.3 hide one | Switch → `active = false`; disappears from the site, stays in the file |
| A-7.4 | 7.4 relate to a therapy | Three Hebrew checkboxes → correct enum values |
| A-7.5 | 7.5 edit or delete one | Text, alt, relations, screenshot replacement; delete removes block and file |

### Chapter 8 - קשר, תפריט, פוטר (5)

| ID | Retires | Test |
|---|---|---|
| A-8.1 | 8.1 phone, WhatsApp, email | **One** field per channel writes both `_href` and `_display`. Test that they can never disagree - the guide's sharpest footgun |
| A-8.2 | 8.2 name and tagline | Edited; the `·` separator survives |
| A-8.3 | 8.3 the menu | Reorder and relabel; **`href` not editable**; `header = false` is a Hebrew switch |
| A-8.4 | 8.4 the Facebook link | URL validated as `https://`; a bad value rejected in Hebrew |
| A-8.5 | 8.5 the footer | All footer fields; §9 channel order preserved |

### Chapter 9 - בדיקה ותקלות (5)

| ID | Retires | Test |
|---|---|---|
| A-9.1 | 9.1 what to check before publishing | **Structural:** the checklist is unnecessary. Assert each of its five items is machine-enforced (quotes, key names, date form, image registration, screenshot path) |
| A-9.2 | 9.2 did it go up | Truthful publish state end to end |
| A-9.3 | 9.3 something looks broken | Preview precedes publish; history offers one-click restore |
| A-9.4 | 9.4 which file for which task | **Structural:** the file map has no referent |
| A-9.5 | 9.5 what not to do alone | Each of its six items is either impossible (B-*) or an explicit "בקשת שינוי מאיתיאל" affordance |

### Chapter 10 - העמודים המשפטיים (6)

| ID | Retires | Test |
|---|---|---|
| A-10.1 | 10.1 where are they | Three documents on one screen |
| A-10.2 | 10.2 what must be filled before launch | The clinic-accessibility paragraph is editable, prompted, and **not** locked |
| A-10.3 | 10.3 when to update the date | `updated` bumps automatically, per file, only for the edited file |
| A-10.4 | 10.4 what must not change | Each locked field in `log/cms-plan.md` §6 is read-only for `owner`, shows a Hebrew reason, offers the request affordance, and **is** editable for `maintainer` |
| A-10.5 | 10.5 analytics | Banner text editable; the cookie sentence, cross-border sentence and both button labels locked. Editing the banner opens the matching `terms.toml` section in the same flow |
| A-10.6 | 10.6 someone asked to remove a recommendation | One click from the recommendations screen hides it; ≤ 3 interactions total |

---

## 7. L5 - guarantees

Each is a claim made in the plan. The test attempts the forbidden thing and
requires it to fail. A guarantee with no failing-path test is marketing.

### 7.1 Structural impossibility

| ID | Claim | Test |
|---|---|---|
| X-1 | She cannot produce invalid TOML | Fuzz every field with hostile input (F-18); the file always parses |
| X-2 | She cannot produce invalid frontmatter | Same for every MDX field; `pnpm check` passes on every result |
| X-3 | She cannot break the build | For 200 generated edit sequences, `pnpm build` succeeds |
| X-4 | She cannot orphan an image reference | Delete is blocked while referenced; the blocking list is correct |
| X-5 | She cannot author a dangling screenshot path | The path is derived, never entered |
| X-6 | She cannot author a second `<h1>` | No h1 control exists; every built page has exactly one `<h1>` |
| X-7 | She cannot author a link | No link control; no `](` appears in authored body copy |
| X-8 | She cannot desynchronise `_href` from `_display` | Property-based: for any phone input, both derive from one source |
| X-9 | She cannot lose work | Kill the tab mid-edit → the draft is restored on reopen |
| X-10 | She cannot publish something she has not seen | Publish is unreachable until a preview for the current draft SHA is ready |

### 7.2 Legal guarantees

| ID | Claim | Test |
|---|---|---|
| X-11 | Locked fields cannot be changed by `owner` | Attempt via UI **and** via a direct API call with an owner session → both rejected |
| X-12 | `updated` cannot go stale | Any content change to a legal file bumps its own date and no other |
| X-13 | The consent buttons stay balanced | Equal weight and wording enforced; asymmetric input rejected |
| X-14 | Banner and terms cannot contradict | Editing one requires visiting the other before publish |

### 7.3 Hebrew-only

| ID | Claim | Test |
|---|---|---|
| X-15 | No Latin reaches a rendered site surface | Scan every string the CMS can write; Latin only in the §1 allowances |
| X-16 | The CMS's own UI is Hebrew and RTL | No English in any screen; `dir="rtl"` throughout |

### 7.4 Regression corpus - real incidents

Both happened on this repo. Both must be impossible.

| ID | Incident | Test |
|---|---|---|
| R-1 | A newline typed inside a TOML basic string broke the build; production served a stale deploy for three days | Enter the identical two-line clinic paragraph into that exact field via the CMS → valid TOML, build passes, text preserved |
| R-2 | `#` in body copy produced six `<h1>` on `/shiatsu` and three on `/about` | Attempt to author an h1 by every route (control, paste, typing `# `) → no h1 in output |

Each new production defect traceable to content adds a row here.

---

## 8. L6 - non-functional

### 8.1 RTL and Hebrew

| ID | Assertion |
|---|---|
| N-1 | Every screen renders RTL with no horizontal scroll at 320, 375, 768, 1280, 1600 px |
| N-2 | Mixed Hebrew/Latin fields (URLs, phone numbers) display correctly without bidi mangling |
| N-3 | Hebrew text with RTL control marks round-trips through every field |
| N-4 | Hebrew filenames (blog slugs) are created, listed and deleted correctly |

### 8.2 Accessibility of the CMS itself

| ID | Assertion |
|---|---|
| N-5 | Zero `axe` violations on every screen at 390 px and 1280 px |
| N-6 | Every task completable by keyboard alone, with visible focus |
| N-7 | All controls ≥ 44×44 px |
| N-8 | Every error is announced to assistive technology, not only coloured |

### 8.3 Mobile

| ID | Assertion |
|---|---|
| N-9 | Add-a-recommendation completes on an emulated phone, camera path included |
| N-10 | Add-a-photo completes on an emulated phone |
| N-11 | The editor is usable with a touch keyboard; no control is obscured |

### 8.4 Errors and resilience

| ID | Assertion |
|---|---|
| N-12 | Every failure path (offline, 401, 403, 409, 422, 500, GitHub rate-limit, Vercel API down, oversized upload, unsupported file type) shows a Hebrew sentence - never a code, never a stack trace |
| N-13 | No raw English error text reaches the DOM in any failure path |
| N-14 | Every error offers a next action; report-to-maintainer carries diagnostics |
| N-15 | An expired session re-authenticates without losing the in-progress draft |

### 8.5 Performance and cost

| ID | Assertion |
|---|---|
| N-16 | Landing screen interactive < 2 s on emulated 4G |
| N-17 | A 6 MB photo upload completes < 15 s on emulated 4G |
| N-18 | The site's own budgets (AGENTS.md §10) are unchanged by anything the CMS writes |

---

## 9. Running it

```bash
cd cms
pnpm test                 # L0, L1, L5 unit - every commit
pnpm test:write           # L2, needs sacrificial-repo secrets
pnpm test:e2e             # L3, L4, L6 - Playwright
pnpm test:parity          # L2 §4.4, slow; nightly and pre-release
```

CI: L0/L1/L5-unit on every push touching `cms/**` **or** `src/content/**` - a
content change can break a CMS test, which is the point of one repo. L2-L6 on
pull requests and nightly.

Open items: Playwright and `@axe-core/playwright` are not yet dependencies;
the sacrificial repo and its App installation do not yet exist; `test:write`,
`test:e2e` and `test:parity` are not yet wired.

---

## 10. What this suite deliberately does not cover

- The **site's** own rendering, accessibility and performance. Already covered
  by `pnpm check`, `pnpm build` and Lighthouse; §4.4 asserts the CMS does not
  change them.
- Whether the owner's copy is *good*. Not testable, and not the CMS's business.
- Anything in the guide's §9.5 "ask first" list: adding pages, tracking tools
  or modalities. Out of scope by design - §6 A-9.5 asserts they stay out.
