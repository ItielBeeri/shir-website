# CMS quality report — admin.shir-amitai.com

The state of the editing surface as it stands, measured against `cms/TEST-SPEC.md` by executing
it against the **production deployment** through a real browser, as the owner would use it.

| | |
|---|---|
| **Build** | `64e2a68` — both Vercel projects deployed and `success` |
| **Unit suite** | 642 tests, 27 files, green; `pnpm check` and `pnpm build` clean for `cms/` and for the site |
| **Acceptance** | 53 pass · 0 fail · 5 partial, of 58 rows |
| **Open defects** | **none** |

---

## 1. Verdict

**The CMS is fit for the owner to use unsupervised.** Every acceptance row either passes or is
partial for a reason that is not a defect, every guarantee in §7 of the spec holds except two
that are recorded decisions, and the engine layer is the strongest part: byte-fidelity survives
a fuzzer and a hostile Unicode corpus, the path allowlist refuses everything outside
`src/content/**` and `public/img/**`, and the publish path touches only what it was asked to.

Three things qualify that, none blocking:

- **The owner-side legal locks are inherited, not currently observed.** They were verified
  directly and the code has not changed since, but the last three test sessions signed in as the
  maintainer, for whom those locks lift by design. It is a compliance control; one owner session
  closes it.
- **Conflict detection has never been exercised live.** It needs `master` to move under a
  pending draft, which only an external writer can do. It has five unit tests against an
  in-memory git and a rendered `is-clash` panel.
- **Vercel's deployment rate limit** is a live operational constraint on this Hobby account. It
  is an environment property, not a product one, but it is what a missing preview usually means.

---

## 2. Acceptance matrix

`P` pass · `F` fail · `~` partial

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
| A-6.3 | **P** | A-7.3 | **P** | A-8.3 | **P** | A-9.3 | **P** | A-10.3 | **P** |
| A-6.4 | **P** | A-7.4 | **P** | A-8.4 | **P** | A-9.4 | **P** | A-10.4 | **P** |
| A-6.5 | ~ | A-7.5 | ~ | A-8.5 | **P** | A-9.5 | ~ | A-10.5 | **P** |
| | | | | | | | | A-10.6 | **P** |

**53 P · 0 F · 5 ~**

The five partials are gaps in *testing*, not in the product. `A-3.5` (replace an image and every
referrer still resolves) and `A-7.5` (edit or delete a recommendation, screenshot replacement
included) each have a half that needs a longer fixture than this suite builds. `A-6.5`, `A-9.1`
and `A-9.5` are structural rows whose assertion is an enumeration — "each of its six items is
either impossible or offers an affordance" — and the enumeration has not been walked item by
item.

### Guarantees

| | | | | | |
|---|---|---|---|---|---|
| X-1 **P** | X-2 **P** | X-3 **P** | X-4 **P** | X-5 **P** | X-6 **P** |
| X-7 ~ | X-8 **P** | X-9 **P** | X-10 **P** | X-11 **P** | X-12 **P** |
| X-13 **P** | X-14 **P** | X-15 **P** | X-16 ~ | R-1 **P** | R-2 **P** |

Both partials are decisions recorded in the spec, not defects. **X-7**: link *syntax* is
neutralised, but a bare `https://…` still autolinks, because the site's markdown is GFM and GFM
resolves character escapes before it scans for addresses — `https:\/\/`, `https\://` and `www\.`
all still become links. The lever is the site's `markdown.gfm`, not the CMS. **X-16**: the only
Latin on any CMS surface is GitHub author logins in the history list and the `Enter` /
`Shift + Enter` key names in the editor's help line.

---

## 3. What has been verified, by area

### Content fidelity

The strongest evidence in the suite, and the reason to trust the rest.

- **TOML** — a value edit changes that value and nothing else: comment count, line count and the
  alignment padding all survive. Verified on `site.toml`, `nav.toml`, `contact.toml`,
  `home.toml`, `recommendations.toml` and `images.toml` against the live files.
- **MDX** — untouched blocks emit their original bytes; an edited block re-serializes minimally.
  Appending `x` to an escaped `\----` correctly *drops* the backslash, because the line stops
  being a block start. Editing a character and reverting it returns the file byte-identical.
- **Hostile Unicode round-trips byte-perfect** through parse → editor → serialize: bidi marks
  and isolates, zero-width space and joiner, Hebrew niqqud, a ZWJ emoji, NBSP, soft and
  non-breaking hyphens, and **both** NFD and NFC forms of the same letter. Content is preserved
  as typed; only *paths* are required to be NFC.
- **Escaping**, proved on a real built page rather than in a unit test. Typed into the editor and
  followed to `www`, each of these renders as literal text: `|`, `~~…~~`, `## ##`, `# …`,
  `--- -`, `----`, `====`, a lone `*`, `1. …`, `<script>alert(1)</script>`, `{expr}`, `&amp;`,
  `&copy;` and `[text](url)`. The built page has `hr = 0`, `h2 = 0`, `table = 0`, `del = 0`,
  `ol = 0` and exactly one `h1`.
- **Fuzzers** cover both halves: generated MDX documents assert that what was typed reads back,
  that a second save writes the same bytes, that every block stays its own block and that no
  heading appears unasked; a TOML fuzzer writes hostile values into every string slot of every
  live file.

### The git write path

- A save commits to `content-draft` only, and costs no build.
- Opening the preview points `content-preview` at the draft's exact commit — one build per draft
  commit, and repeat opens push nothing.
- Publish measures from the **merge base**, applies only the paths it changed, and never swaps
  the whole tree — so the `images.yml` derivative commits survive. Verified: a publish of one
  file produced a one-file diff.
- The publish subject distinguishes what happened: `הוספת הפוסט «…»` against `מחיקת הפוסט «…»`.
- Discard restores a file byte-exactly from `master`; restore returns it byte-exactly to a prior
  blob, checked against `git show`.

### The permission boundary

Tested against the real proxy, which is the permission model — not the UI.

Refused with a specific Hebrew reason: paths outside `src/content/**` and `public/img/**`,
`src/content/config.ts`, `public/img/_opt/**`, traversal in every form (`../`, percent-encoded,
backslash separators, absolute), empty and padded segments, dot-prefixed segments, and
extensions outside the allowlist. Reads are bounded the same way and say *refusing to read*
rather than *write*. A request with no session cookie is 401 before any GitHub call.

A rename onto an occupied path is refused server-side (`409 exists`), not only by the screen; a
rename from a missing source returns `409 missing` rather than a 502 from the layer underneath.

Branch parameters in a save body are ignored — `content-preview` is a ref the engine *moves* and
never a target content can be written to.

### The legal documents

- Locked sections are refused server-side for the owner, each with its own Hebrew reason; the
  screen disables 17 of 31 fields and offers *"בקשת שינוי מאיתיאל"* on each locked section.
  Defence in depth, both halves working.
- A maintainer may edit them — and **still cannot make consent invalid**. The balance and
  disclosure rules bind both roles: an exclamation mark, an unbalanced button pair, or a banner
  body missing the cookie sentence, the cross-border sentence or the named recipient are each
  refused whoever is signed in.
- None of the three files can be deleted or renamed by anyone.
- `updated` bumps automatically, to today, **only in the edited file**.

### Images

A 2.9 MB 4000×3000 JPEG is downscaled client-side to 2048×1536 / 528 KB, with both sizes shown
before committing, and the image and its manifest entry land in **one commit**. Alt text is
required: the button stays disabled with a Hebrew reason until either an alt is written or
"decorative" is ticked, which disables the alt field and yields `alt = ""`.

The id is derived and the owner never sees it. The derivation is total and collision-free: a
name reducing to a taken id gets a suffix, and an all-Hebrew filename, which reduces to nothing,
falls back to a dated key. Deleting a referenced image is refused and the referring pages are
named; deleting an unreferenced one is permitted and says so.

### The rest of the surface

- **Ordering** matches the site's own `sortBlogPosts()`, including the pinning arithmetic:
  promoting a dated post above a pinned one writes `order: 1` on it and renumbers the existing
  pin to `order: 2`.
- **The menu** offers a label and a header switch per item and **no `href` field at all**;
  reordering moves each `href` with its label.
- **Recommendations** — file order is display order, including deliberate out-of-sequence
  entries; hiding is one click and writes `active = false`, and the round trip back is
  byte-identical; Hebrew therapy toggles write the correct enum values.
- **Contact details** — one input per channel derives every key: a phone becomes `wa.me/…`,
  `tel:+…` and a formatted display, and the screen previews the derivation as she types. A
  malformed phone, email or URL is refused in Hebrew, `javascript:` included. An emptied link is
  accepted and dropped from the site rather than rendered as `<a href="">`. Required fields are
  refused empty, including whitespace-only.
- **Unsaved work** survives a full page reload and is offered back explicitly —
  *"שחזור מה שכתבתי"* or *"להתחיל מהגרסה שבאתר"* — rather than silently restored.
- **Publishing** is gated until a preview of the *current* draft commit is ready, and the preview
  opens on the page that changed. Where the build will not have that page — a hidden post, a
  deletion — it opens the parent listing and says in Hebrew what is missing and why. A publish
  whose build never reports ends on *"השינוי פורסם"* rather than on an unbounded wait.

### Accessibility and RTL

No contrast failure, no unnamed control, no heading skip, one `h1` per screen, `lang="he"` and
`dir="rtl"`, no horizontal overflow at 375 px, and no interactive control under 44 px — the one
24 px checkbox sits inside a clickable 44 px label. Errors carry `aria-invalid` and an
`aria-describedby` pointing at the message, so they reach a screen reader and not only the eye.
Every control repeated per row names its row (`העברת «מה זה צל» למעלה`), so a list of five posts
is navigable by control rather than five identical buttons.

---

## 4. Known characteristics, by design

Neither is a defect; both are recorded in the spec so they are not re-found.

- **Bare URLs autolink** in body copy. GFM resolves character escapes before scanning for
  addresses, so no escaping in the CMS can prevent it. If unstyled links in body copy are
  unwanted, the fix belongs in the site's `markdown.gfm` or in `.prose`.
- **`content-preview` accumulates orphaned tips.** The ref is force-moved to each previewed draft
  commit, so previous tips become unreachable. That is the designed steady state, not residue.

---

## 5. Not verified, and why

| Area | Reason |
|---|---|
| **Owner-side legal locks, currently** | Verified directly and unchanged since; the last three sessions ran as `maintainer`, for whom the locks lift by design. |
| **Conflict detection, live** | Needs `master` to move under a pending draft — only an external writer can do that. Five unit tests and the `is-clash` panel cover it. |
| **`axe` proper (N-5)** | The CMS's own CSP (`script-src 'self'`) blocks loading axe-core. Substituted a scripted audit: contrast against computed backgrounds, accessible names, roles, focus, target sizes, heading structure, unlabelled fields. It is what found both accessibility defects that have since been fixed. |
| **N-16 / N-17 on 4G** | No throttling available. The eager payload is 174 KB across two chunks (entry 32.5 KB + react 142 KB), with the editor and vendor chunks lazy. |
| **B-10** | Needs a second, non-allow-listed GitHub account. |
| **B-11** | Verified by code rather than by attack: the session cookie is AES-256-GCM sealed, HttpOnly, Secure, SameSite=Lax, so tampering fails the auth tag. |
| **The deploy screen's give-up state, unfaked** | Reached by stubbing `Date.now` past the watch limit against the real deployed bundle. Everything but the clock was real; seeing it arise on its own needs a build to genuinely go missing. |

---

## 6. Repository state

Content is byte-identical to the deployed baseline. Testing left nothing behind: every probe was
either refused before it could write, or reverted through the product's own discard, delete and
restore — each verified byte-identical to `master` afterwards. `git ls-tree` on `master` shows no
test residue. `pending` and `conflicts` are both empty, and `content-draft` content matches
`master`.

---

## 7. Recommended next steps

Nothing here is a defect.

1. **One owner-session probe of the legal locks**, to replace an inherited result with an
   observed one. It is a compliance control and it is ten minutes.
2. **A conflict test**, next time anyone pushes to `master` — the occasion makes it nearly free,
   and the mechanism has never been seen working end to end.
3. **Decide `X-7` deliberately** — whether bare-URL autolinking in body copy is wanted. If yes,
   it is already recorded; if no, the change is the site's markdown dialect, not the CMS.
4. **Retire the tool-shaped gaps in §5** — `axe` proper, 4G throttling, and a second GitHub
   account for `B-10`. Each is a one-off setup cost that removes a permanent caveat.
