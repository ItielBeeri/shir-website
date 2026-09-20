# CMS plan - a friendly editing surface for shir-amitai.com

Status: **approved plan, not yet implemented.** Written 2026-09-20.

This document records approved decisions only. It supersedes nothing in
`AGENTS.md`; where the two disagree once `cms/` exists, `AGENTS.md` wins.

---

## 1. Why

The owner cannot work in `vscode.dev`. A file tree, exact syntax, and a
sequence of technical steps to reach a single goal are each, on their own,
enough to stop her. `editor-guide/index.html` answers 58 questions across 10
chapters, and needing it at all is the diagnosis.

The replacement keeps everything except the interface:

| Layer | Stays |
|---|---|
| Storage | the same GitHub repo |
| Authentication | the same GitHub account |
| Effect of an action | a commit + push to the same repo |
| Website stack, structure, build, deploy | untouched |
| **Interface** | **replaced entirely** |

Two findings from the survey justify the effort better than any argument. Both
were repaired on 2026-09-20 (§9); they are recorded here because both are
exactly the class of error a constrained editor makes unreachable.

- **`master` did not build.** `src/content/pages/accessibility.toml` line 75
  held a basic string with a newline inside it - the owner pressed Enter while
  filling the one field the guide (§10.2) told her only she could write.
  Production had served a stale deploy since Sep 17 and the clinic-accessibility
  paragraph had never shipped.
- **Body copy contained headings the site cannot render.** `shiatsu.mdx` had
  five `#` h1s and `about.mdx` two, so `/shiatsu` shipped six `<h1>` elements
  and `/about` three, against `AGENTS.md` §10's "one `<h1>` per page".
  `.prose` styles only h2 and h3, so they painted at browser-default size.

---

## 2. The core idea

The owner never sees a file, path, id, bracket, quote, branch or commit. She
sees **tasks in Hebrew**. Each task resolves to one atomic commit against
`ItielBeeri/shir-website`, under her own GitHub identity, touching only
`src/content/**` and `public/img/**`.

Three properties do most of the work of "needs no guide":

| Property | Retires |
|---|---|
| One task = one screen = one commit | guide §3.1+3.2 and §7.1 - the two-step flows behind its most common errors |
| Invalid states unreachable | guide ch. 2 entirely, plus §1.7 and §9.5 |
| See it, then publish it | guide §9.1, §9.2, §9.3 |

Seventeen of the guide's 58 questions stop being questions. The rest become
screens (§5).

---

## 3. Deployment layout

One repo. Two Vercel projects. One GitHub App. No new vendors. ₪0/month.

```
                    ┌─────────────────────────────────────────┐
   owner's browser  │  admin.shir-amitai.com   (Vercel #2)    │
   (phone/desktop)  │  ┌───────────────────────────────────┐  │
        ──────────► │  │ static SPA - Vite + React + TS    │  │
                    │  │ Hebrew, RTL, mobile-first         │  │
                    │  └───────────────────────────────────┘  │
                    │  ┌───────────────────────────────────┐  │
                    │  │ /api/auth/{login,callback,logout} │  │
                    │  │ /api/gh/[...path]   ← path-gated  │  │
                    │  │ /api/status         ← build state │  │
                    │  └───────────────┬───────────────────┘  │
                    └──────────────────┼──────────────────────┘
                                       │ user access token (HttpOnly cookie)
                          ┌────────────┴────────────┐
                          ▼                         ▼
        ┌──────────────────────────────┐   ┌──────────────────┐
        │ GitHub App                   │   │ Vercel REST API  │
        │ "shir-website-editor"        │   │ (read-only token)│
        │   Contents: read & write     │   │ deployment state │
        │   Metadata: read             │   └──────────────────┘
        │   installed on ONE repo      │
        └──────────────┬───────────────┘
                       │
        ┌──────────────┴───────────────────────────────────────┐
        │  ItielBeeri/shir-website  (public)                   │
        │                                                      │
        │    content-draft ──── Vercel preview deployment      │
        │         │ path-scoped apply                          │
        │         ▼                                            │
        │    master ─────────── www.shir-amitai.com (Vercel #1)│
        │                       + images.yml derivative bot    │
        └──────────────────────────────────────────────────────┘
```

### 3.1 Repository layout

```
shir-website/
├── src/ public/ astro.config.mjs package.json pnpm-lock.yaml   ← untouched
├── cms/
│   ├── package.json  pnpm-lock.yaml   ← its OWN, deliberately not a workspace
│   ├── vercel.json                    ← CMS project config
│   ├── src/                           ← SPA
│   └── api/                           ← serverless functions
├── vercel.json                        ← gains an ignoreCommand (§3.3)
├── AGENTS.md                          ← gains §13, pays for it (§10)
└── .github/workflows/
    ├── images.yml     ← unchanged; its paths filter already excludes cms/**
    └── cms-ci.yml     ← new, filtered to paths: ['cms/**']
```

`.gitignore` needs no change: `node_modules/`, `dist/` and `.env*` are all
unanchored patterns and already match at any depth.

**`cms/` is not a pnpm workspace member.** It carries its own `package.json`
and lockfile. A `pnpm-workspace.yaml` would re-resolve and re-hoist the
*website's* dependency tree; against a site with a 60 KB JS budget and a
measured LCP story that is a real regression risk for no benefit. Nested and
independent means a root `pnpm install` produces exactly today's tree.

### 3.2 Why one repo

The golden round-trip tests of §7 are the gate this whole plan rests on. In one
repo they run against the **live content files in the same commit** - change a
TOML comment or a post's line breaks and the CMS's tests see it immediately.
Two repos means vendored or fetched fixtures, and stale fixtures are how that
gate quietly stops testing anything.

The cost is honest: "the website build is provably untouched by construction"
becomes "untouched by convention, plus an ignore command and a CI path filter."

### 3.3 Vercel

| | Project #1 (site) | Project #2 (CMS) |
|---|---|---|
| Root directory | `.` | `cms/` |
| Domain | `www.shir-amitai.com` | `admin.shir-amitai.com` |
| Config file | `/vercel.json` | `/cms/vercel.json` |
| Output | static | static + functions |

Without an ignored-build-step, every CMS commit redeploys the website. Project
#1's `vercel.json` gains:

```json
"ignoreCommand": "git diff --quiet HEAD^ HEAD -- src public astro.config.mjs package.json pnpm-lock.yaml vercel.json"
```

Exit 0 skips the build. This is why `AGENTS.md` §10.1's "holds cache headers
and nothing else" is softened in §10 below.

### 3.4 Authentication

A GitHub **App** (not an OAuth App), installed on one repository, with
*Contents: read & write* and *Metadata: read*. Nothing else - it cannot reach
settings, workflows, or any other repo.

1. `admin.shir-amitai.com` → one button: **התחברות**.
2. `/api/auth/login` → GitHub authorize → `/api/auth/callback`.
3. The function exchanges the code for a user access token (client secret stays
   server-side), checks the GitHub login against the allow-list, and sets the
   token in an **HttpOnly, Secure, SameSite=Lax** cookie.
4. The SPA never holds the token. All GitHub traffic goes through
   `/api/gh/[...path]`, which attaches it.

That proxy is the permission model, not just plumbing. Server-side it rejects
any write outside `src/content/**` and `public/img/**`, and any branch other
than `content-draft` and `master`. Guide §1.7 and §9.5 become physically
impossible rather than remembered.

User-token expiry is disabled in the App settings, so she signs in a couple of
times a year. Revocation is uninstalling the App.

**Two roles, one app**, keyed off the authenticated GitHub login:

| Role | Who | Difference |
|---|---|---|
| `owner` | שיר | Legal fields in §6 render read-only |
| `maintainer` | איתיאל | Those fields are editable, behind a confirm step |

Everything else is identical, so there is one UI to reason about and the
maintainer sees precisely what the owner sees.

**Secrets** live only in Vercel project #2's encrypted environment variables -
never in the repo, never in the client bundle: the GitHub App client id and
client secret, a session signing secret, a read-only Vercel API token, the
allowed GitHub logins, and the target repo. The repo is public; nothing in
`cms/` depends on being unreadable, because every rule is enforced server-side.

### 3.5 Publish

- Each save → a commit on `content-draft`.
- Vercel builds that branch's preview automatically (already default).
- The app shows the real preview with a live build indicator from the Vercel
  API (`בונה…` → `מוכן לצפייה`). **On desktop, both viewports side by side** -
  a 390 px mobile frame and a fluid desktop frame off one build. On phones, the
  mobile frame with a toggle.
- One green button: **פרסמי לאתר**.
- Publishing **applies only the paths the draft changed** relative to its
  merge-base with `master`, onto master's current tree. Never a whole-tree
  swap: `images.yml` pushes derivative commits to `public/img/_opt/` on master,
  and a whole-tree swap would revert them.
- Each editing session refreshes `content-draft` from `master` at the start, so
  divergence stays minutes rather than weeks.
- Master's head SHA is re-read immediately before every write, so a concurrent
  bot push can never cause a lost update.
- After publish, the app polls production deployment state →
  **"פורסם. השינוי באתר."** That answers guide §9.2 permanently.

---

## 4. The rich-text editor

### 4.1 The governing rule

**The editor may only offer constructs the site actually styles.** Anything
else produces content that renders wrong, and the owner has no way to tell.

Current reality, verified against both `.prose` blocks
(`TherapyPage.astro`, `blog/[slug].astro`) and `public/global.css`:

| Construct | Styled today? | In the editor |
|---|---|---|
| `##` → h2 | yes, both templates | **כותרת** |
| `###` → h3 | yes, both templates | **כותרת משנה** |
| `-` → `ul` | yes (`ul, ol` + `li` rules) | **רשימה** |
| `1.` → `ol` | yes (same rules) | **רשימה ממוספרת** |
| `*text*` | weight 600 (Hebrew emphasis) | **הדגשה** |
| `_text_` | real italic via `remark-underscore-italic` | **נטוי** |
| `**text**` | bold | **מודגש** |
| `<SoftImage />` | yes | **תמונה** |
| `[text](url)` | **no** - see §4.2 | **קישור**, after the CSS rule lands |
| `#` → h1 | **no** - see §4.3 | **not offered** |

### 4.2 Links need one CSS rule first

`public/global.css:159` resets `a { color: inherit; text-decoration: none; }`
and neither template adds a `.prose a` rule. A link in body copy today would be
visually indistinguishable from the text around it - undiscoverable, and a
WCAG 1.4.1 and 2.4.4 failure against the site's AA commitment.

So link support is two steps, in order:

1. Add a `.prose :global(a)` rule to both templates - underline plus
   `var(--accent)`, with a visible focus ring. Tokens only, per §4.2 of
   `AGENTS.md`.
2. Then the editor offers **קישור**, with a Hebrew link-text field and a URL
   field. External links get `rel="noopener"`. Link text must be Hebrew
   (`AGENTS.md` §1 constraint 1); the URL is a href and therefore exempt.

### 4.3 Why not `#`

The page template already owns the page's single `<h1>`
(`TherapyPage.astro:75`), and `.prose` has no h1 rule in either template. Body
`#` produces a second, third and sixth `<h1>`, unstyled - which is what
`shiatsu.mdx` and `about.mdx` do today.

The editor therefore offers two levels, mapped to h2 and h3. If a third level
is ever wanted it must be h4 with a matching `.prose h4` rule, never h1.

**Content fix required:** the seven existing `#` lines - `shiatsu.mdx` 13, 26,
30, 42, 52 and `about.mdx` 28, 48 - become `##`. This restores one `<h1>` per
page, gives those headings their intended styling, and is a prerequisite for
the round-trip gate in §7.2 passing on real files.

### 4.4 `remark-breaks`

`remark-breaks` is on, so **a single newline is a visible line break**, and the
owner's copy depends on it throughout. A conventional WYSIWYG would silently
reflow her paragraphs.

The editor is therefore a ProseMirror/TipTap schema restricted to exactly the
table in §4.1 and nothing else, where Enter emits a single newline (line break)
and Enter twice emits a blank line (new paragraph). The three emphasis controls
render their true appearance live using the site's own type tokens, so the
`*` / `_` / `**` distinction never has to be explained in words.

---

## 5. Screens

Landing screen: large Hebrew cards, icon plus verb. No tree, no file list.

```
┌──────────────────────────────────────────────────────┐
│  שלום שיר 👋              ● 2 שינויים שטרם פורסמו →  │
├──────────────────────────────────────────────────────┤
│  ✍ כתיבת פוסט חדש      📚 הפוסטים שלי                │
│  💬 המלצות             🖼 התמונות שלי                 │
│  🏠 דף הבית            🙋 עמוד אודות                  │
│  🌿 עמודי הטיפולים     ✉ יצירת קשר                   │
│  ☰ תפריט וכותרת תחתונה 📞 פרטי הקשר שלי              │
│  ⚖ עמודים משפטיים      🕐 היסטוריה ושחזור            │
└──────────────────────────────────────────────────────┘
```

| Guide chapter | Becomes |
|---|---|
| 1 איך עובדים · 2 כללי כתיבה | *Nothing.* Dissolved by the app existing. |
| 3 תמונות | **התמונות שלי** - visual gallery. Upload with client-side downscale and a size readout; Hebrew alt required, or an explicit "זו תמונת קישוט" → `alt=""`; replace in place; delete blocked with "התמונה בשימוש ב…" and the list. Ids are generated, never typed, never shown. |
| 4 בלוג | **כתיבת פוסט חדש** (three-step wizard) and **הפוסטים שלי** (cards, drag to pin, מוצג/מוסתר switch, rename, delete with confirm). |
| 5 עמודי הטיפולים | Three cards, same editor as a post. `accent` not rendered at all. Order by drag. |
| 6 עמודי האתר | **דף הבית / עמוד אודות / יצירת קשר** - forms with Hebrew labels and a thumbnail of the live section beside each field. "הדף לא נמצא" under advanced. |
| 7 המלצות | Card per recommendation: screenshot, transcription, three Hebrew modality checkboxes, מוצגת/מוסתרת switch, drag to reorder. Adding = drop the screenshot, paste the text; `id` and `screenshot` are derived, so the guide's build-breaking path mismatch is unreachable. |
| 8 קשר, תפריט, פוטר | **פרטי הקשר שלי** - *one* phone field writing both `phone_href` and `phone_display`, one WhatsApp number composing the `wa.me` URL, one email field. The guide's "each detail appears twice" warning stops applying. **תפריט** - drag list, labels only, `href` invisible. |
| 9 בדיקה ותקלות | Preview, publish status, and **היסטוריה ושחזור**: commits as Hebrew sentences ("החלפת את תמונת הפורטרט בדף הבית · יום שלישי 14:20"), each with **החזירי גרסה זו**. |
| 10 העמודים המשפטיים | §6 below. |

### 5.1 UX rules for the build

1. **No jargon.** Never "commit", "branch", "file", "מזהה", "TOML". Publishing
   is **פרסום**.
2. **Nothing is lost.** Per-screen autosave to IndexedDB, restored on reopen; a
   leave-guard; every publish recoverable from history.
3. **Save is never a leap.** Disabled only with an inline Hebrew reason beside
   the offending field ("צריך תיאור לתמונה - מה רואים בה?").
4. **Errors speak Hebrew.** No HTTP codes, no stack traces. Every failure maps
   to a sentence plus **שליחת דיווח לאיתיאל** (prefilled mail with diagnostics).
5. **Mobile-first.** Recommendation screenshots arrive on her phone; adding a
   recommendation or a photo must work there, camera included.
6. **The app meets AA itself.** It would be strange if the tool for maintaining
   an accessible site were not.

---

## 6. Legal pages and locked fields

All three files are in scope: `accessibility.toml`, `terms.toml`,
`consent.toml`. Most of their text is ordinary prose she should be able to fix
without asking anyone.

A **locked field** is a specific *value* that is a factual or legal claim about
what the site or clinic actually does, where a well-meant wording improvement
creates exposure. It renders read-only for the `owner` role, with a one-line
Hebrew reason and a **בקשת שינוי מאיתיאל** button. The `maintainer` role edits
it behind a confirm step.

| File | Locked | Why |
|---|---|---|
| `accessibility.toml` | the ת"י 5568 חלק 1 / AA sentence | names the standard the site is certified against |
| | the `items` list of adaptations | every line asserts something the code actually does |
| | the "מגבלות ידועות" section | understating known gaps is the exposure |
| | the no-exemption sentence | a statutory statement |
| `consent.toml` | the cookie sentence | first layer of disclosure |
| | the cross-border transfer sentence | the click here *is* the transfer consent |
| | `accept` / `decline` labels | consent via a weakened refusal is invalid, which voids the acceptances too (`AGENTS.md` §12) |
| `terms.toml` | the "מדידה וסטטיסטיקה" section | must not contradict the banner |

Everything else - "המחויבות שלי", "נגישות הקליניקה והשירות הפיזי", "פניות
בנושא נגישות", and general wording - is freely editable, which is the point:
the clinic-accessibility paragraph is the one thing only she can write, and
it is currently what broke the build.

Two duties become mechanical rather than remembered:

- `updated` bumps automatically on save, per file (`AGENTS.md` §10).
- Editing the consent banner opens the matching `terms.toml` section in the
  same flow, so the two cannot drift apart (`AGENTS.md` §12).

---

## 7. The two hard parts

Everything else is ordinary application work. These two are where the plan can
fail, so they go first and gate everything after.

### 7.1 Format-preserving TOML writes

The TOML files carry **67 Hebrew comment lines** addressed to the owner, which
`AGENTS.md` §0 requires stay accurate, plus 11 `PLACEHOLDER` markers. Parse →
modify → stringify destroys all of them.

| File class | Strategy |
|---|---|
| Files with comments - `site.toml` (5), `nav.toml` (5), `home.toml` (2), `contact.toml` (3), `404.toml` (2), `images.toml` (2), `accessibility.toml` (16), `consent.toml` (17), `terms.toml` (18) | **Surgical splice.** Parse with `toml-eslint-parser` for an AST with source ranges, locate the exact value span, replace only those bytes. Everything else stays byte-identical. |
| `recommendations.toml` - verified zero comments | Deterministic full re-serialization with a fixed formatter. This is what makes drag-to-reorder cheap. |

**Gate:** a golden round-trip test reads all ten TOML files, writes every value
back unchanged, and asserts byte equality. It must pass before any screen is
built.

### 7.2 Format-preserving MDX writes

**Gate:** load all four blog posts, three therapy files and `about.mdx` into the
editor and serialize back - **byte-identical**, or the schema is wrong. This
runs after the §4.3 heading fix, since `#` is not in the editor's vocabulary.

### 7.3 Drift

`src/content/config.ts` imports `astro:content`, a virtual module the CMS
cannot resolve, so schema parity needs a small TypeScript-compiler-API parse
rather than a plain import. A `cms-ci.yml` job asserts every key present in the
live content files is known to the CMS content model and vice versa.

---

## 8. Phasing

| Phase | Delivers | Risk |
|---|---|---|
| **0 - Foundations** | GitHub App, Vercel project #2, login and roles, path-gated proxy, commit/publish engine, and **both gates from §7** | **High. The plan is proven or rewritten here.** Ends with: she edits one sentence on יצירת קשר, previews, publishes. |
| **1 - Forms** | דף הבית · יצירת קשר · 404 · פרטי קשר · תפריט · פוטר · about frontmatter. Guide ch. 1, 2, 6, 8 | Low |
| **2 - Images** | Gallery, upload, downscale, alt, replace, reference-checked delete, picker. Guide ch. 3 | Medium |
| **3 - Rich text** | The §4 editor, blog, therapy pages, about body, in-body images. Guide ch. 4, 5, 6.2 | Medium |
| **4 - Recommendations** | Cards, drag order, hide, one-shot add. Guide ch. 7, 10.6 | Low |
| **5 - Legal** | §6 in full | Low, needs care |
| **6 - Safety net** | History and restore, pending-changes tray, Hebrew error mapping, mobile and a11y pass, first-run walkthrough | Low |

Phases 1-6 ship independently; she can start using the app after Phase 1 and
keep `vscode.dev` for the rest during the transition.

---

## 9. Prerequisites in the website

Three changes to the site, all small, none structural.

1. ~~**Fix the build.**~~ **Done 2026-09-20.** `accessibility.toml:75` - the
   two-line basic string was joined into one, her wording byte-identical.
   `.legal-paragraph` has no `white-space: pre-line` (only `.legal-intro`
   does), so a joined line and a `"""…"""` block render identically, and every
   other `body` entry in the file is a single-line string.
2. ~~**`#` → `##`**~~ **Done 2026-09-20.** Seven lines, body only, frontmatter
   comments untouched: `shiatsu.mdx` (5) and `about.mdx` (2). Every page now
   has exactly one `<h1>` and no skipped level. §4.3.
3. **`.prose :global(a)`** rule in both templates, before links are offered.
   §4.2. **Still outstanding.**

After 1 and 2: `pnpm check` 0 errors / 0 warnings, `pnpm build` clean,
14 pages.

**Open editorial question from 2.** She used `#` to mean "make this line stand
out", which coincides with a section heading only sometimes. Four of the seven
are true section headings (`פרטים טכניים:`, `טיפול וליווי בבית…`,
`מטפלת מזה 15 שנה…`, `_ולמה, כל זה?_`). Three are lead *sentences* that now sit
in the heading outline, where a screen-reader user navigating by heading will
meet them as section titles: `shiatsu.mdx` "הטיפול מתקיים לרוב על מזרן…" and
"אנחנו בריקוד משותף… -" (which continues into the next line), and `about.mdx`
"אם משהו כאן דיבר אליך…". Demoting those three to emphasized paragraphs is a
content decision, not a markup one, so it was left to her. The CMS makes the
distinction visible by construction: **כותרת** and **הדגשה** are different
buttons.

Optional, one line, no production effect: add `content-draft` to
`images.yml`'s trigger so previews show optimized images. The design works
without it - `imageSources()` falls back to the original on a digest mismatch,
so a freshly uploaded photo previews correct but unoptimized.

---

## 10. The AGENTS.md amendment

A separate `cms/AGENTS.md` was considered and **rejected**: a session that
restructures part of the site is exactly the session that must know how the CMS
edits that part, and splitting the two guarantees drift. Everything stays in
the one file, under its 200-line cap.

The file is at **199 lines**, so the addition must be paid for line-for-line.

**Adds (~11 lines):** a `## 13. The editing surface` section stating that
`cms/` is the owner's only editing surface and a separate Vercel project; that
it is deliberately not a workspace member; that §1 constraint 4 (static only)
describes the site, not `cms/`; that **anything owner-editable changing shape -
a TOML key, a frontmatter field, a folder layout, a `.prose` rule - must update
`cms/` in the same commit**; and that the editor may only offer constructs
`.prose` styles, with no `h1` because the page template owns it.

Plus two in-place edits at zero net cost: `cms/` in the §2 tree, and §10.1's
"holds cache headers and nothing else" softened to admit `ignoreCommand`.

**Cuts to pay for it (~11 lines), all from §2's "Not part of the build":**

- the `editor-guide/` bullet and its "update it whenever" duty - that duty is
  what the new §13 replaces, and the guide becomes an archived fallback
- the `coming-soon-page/` bullet - a retired page with no operational bearing
- the `log/` bullet compressed to one line
- the `src/components/` and `lib/` inline comments in the tree, which restate
  names that are already self-describing

Net delta ≤ 0. The exact diff is prepared separately for review before it is
applied.

---

## 11. Risks

1. **§7.1 / §7.2 round-trips.** The only items that could invalidate the
   approach; front-loaded into Phase 0 deliberately.
2. **Schema drift.** Mitigated by §7.3.
3. **Vercel Hobby's non-commercial clause.** Already applies to the live site;
   the CMS does not worsen it. Cloudflare Pages + Workers is a drop-in
   alternative for both if it ever matters.
4. **The accessibility statement's standing duty.** The CMS reduces the burden
   but cannot discharge it - a *code* change affecting accessibility still
   requires updating `accessibility.toml`, per `AGENTS.md` §10.
5. **`cms/` is public.** No secrets in it; every rule is server-side. The
   content model and guard rails are readable, which is acceptable.

---

## 12. Open

- Whether to offer a third body heading level at all (h4 + a `.prose h4` rule),
  or stop at two. The plan assumes two.
