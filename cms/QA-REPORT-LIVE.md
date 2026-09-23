# CMS live quality report — admin.shir-amitai.com

End-to-end execution of `cms/TEST-SPEC.md` against the **production deployment**, driven
through a real browser as the owner would use it.

| | Run 7 | Run 8 | Run 9 | Run 10 | Run 11 (current) |
|---|---|---|---|---|---|
| **Date** | 2026-09-23 | 2026-09-23 | 2026-09-23 | 2026-09-23 | 2026-09-23 |
| **Build** | `8e235e7` | `bef7249` | `bef7249` | `0be0269` | `9a6aed1` |
| **Role tested** | owner | owner | owner | maintainer | maintainer |
| **Scope** | targeted | targeted | full, from scratch | the run-9 findings | **the run-10 finding and the screen it rewrote** |
| **Verdict** | one inert in production | Everything open closed | Three new findings | All three fixed; one leftover | **Leftover fixed at the root; the rewrite left one property behind** |

Runs 1–3 re-tested everything (runs 1 and 2 are summarised in §14). Runs 4–8 each focused on the
round before; run 9 started over from the spec. Findings keep their original numbers.

---

## 1. Verdict

**`R10-1` is fixed, and fixed at the root rather than at the symptom.** The recommendation was to
move one string; what landed instead is `src/model/site-fields.ts`, which makes the contact
screen read its fields off `screens.ts` rather than restating them. The duplicate list is gone,
so the class of bug is gone with it — the help text now renders on **all four** social fields,
where before only one field had help at all.

**The rewrite left one property behind, and that is this round's finding.** `SiteDetails.tsx`
now takes `path`, `label` and `help` from the model. It does not take `required`. `brand.name`
and `brand.tagline` are both `required: true` in `screens.ts`, and on this screen they can be
emptied: save stays enabled, no message appears, and the file receives `name = ""` and
`tagline = ""` (`R11-1`).

The contrast is the proof. On a screen rendered by the generic `TomlForm`, emptying a required
field disables save and says **"צריך למלא: השם"**. On the contact screen, nothing stops it. Same
model, same flag, one screen honouring it.

That makes `R11-1` the same shape as `R10-1` one property over: unifying the *list* was right,
but a bespoke renderer still has to consume everything the list carries.

| Exit criterion | Run 8 | Run 9 | Run 10 | Run 11 |
|---|---|---|---|---|
| All 58 acceptance rows pass | No failures; 5 partial | No failures; 7 partial | No failures; 5 partial | **No failures; 6 partial** |
| §4.1 fidelity gates pass live | Yes | Yes + Unicode | Yes | **Yes** — site.toml re-proved line-for-line |
| Build parity (§4.4) | Both ways | Previews only | Previews only | **Not exercised** — Vercel rate limit |
| Every §7 guarantee passes | Unchanged | X-4 both ways | X-11 both roles | **Unchanged** |
| Zero `axe` violations | None | `R9-3` | None | **None** |
| Green in CI three times | n/a | n/a | n/a | n/a |

Open after run 11: one medium (`R11-1`), plus the standing design decision (`R2-3`/`X-7`) and the
informational note (`R4-2`). Two things remain inherited rather than observed: the **owner-side
legal locks** (this round was again signed in as `ItielBeeri`/maintainer) and **build parity**.

---

## 2. Round 11 — the contact screen, rebuilt

`9a6aed1` is live and its CMS deployment succeeded. `pnpm test` green at **632** across 26 files
(was 630/26); `pnpm check` and `pnpm build` clean.

| Finding | Severity | Verdict |
|---|---|---|
| `R10-1` help text never reaches the screen | LOW | **Fixed at the root** — one field list, four fields with help |
| `R11-1` required fields not enforced on that screen | MEDIUM | **New** — see below |

### R10-1 — fixed, and the duplication with it

`site-fields.ts` reads the screen's groups from `screenById('site')`, separates the contact group
(whose two inputs write five TOML keys, which is why the screen is bespoke at all) from the rest,
and hands the rest to the renderer as they come. `SiteDetails.tsx` no longer contains a field
list.

Observed on the live screen: all four social fields now carry
*"אפשר להשאיר ריק - אז הקישור פשוט לא יופיע באתר"*. Before the fix, only Facebook had help and it
said something else.

An unasked-for improvement came with it: the phone field now previews its own derivation —
*"על המסך יופיע 054-987-6543 · בלחיצה יתקשרו אליו · וואטסאפ ייפתח לאותו מספר"* — which updates as
she types. `X-8`'s guarantee was always true; now it is also visible.

### The rewritten screen, regression-tested

121 lines of `SiteDetails.tsx` changed, so the screen was re-tested rather than assumed.

| Check | Result |
|---|---|
| All 11 fields present, same ids | **Pass** |
| `X-8` phone → three keys | **Pass** — `wa.me/972549876543`, `tel:+972549876543`, `054-987-6543` |
| `X-8` email → two keys | **Pass** — `mailto:` and display from one input |
| `A-8.2` tagline, `·` separators | **Pass** |
| `A-8.5` footer fields | **Pass** |
| TOML fidelity | **Pass** — exactly 7 lines changed, line count identical, all comments and alignment preserved |
| `A-8.4` bad URL | **Pass** — `http://`, `javascript:`, bare host all refused in Hebrew |
| `A-8.4` empty URL | **Pass** — accepted, and now explained |
| Phone / email validation | **Pass** — both refuse with a Hebrew reason and block save |
| **Required text fields** | **Fail** — `R11-1` |

### R11-1 · Required fields are not enforced on the contact screen — MEDIUM

`screens.ts:247-248` marks both brand fields required:

```ts
{ key: 'brand.name',    path: ['brand', 'name'],    label: 'השם',           type: 'text', required: true },
{ key: 'brand.tagline', path: ['brand', 'tagline'], label: 'שורת התחומים', type: 'text', required: true },
```

Emptying either leaves save enabled with no message, and saving writes:

```toml
[brand]
name    = ""
tagline = ""
```

Tested with the form already dirty from a valid edit, so "save is disabled" could not be confused
with "nothing to save" — and against an invalid phone in the same state, which *does* disable
save. The difference is the field type, not the form state.

**What it costs.** `seo.ts:19` reads `brand.name` into `PERSON_NAME`, used five times across the
JSON-LD: `Person.name`, `HealthAndBeautyBusiness.name`, the `Service` provider and
`BlogPosting.author`. All become empty strings on every page — structured data that validates as
present and says nothing, against a stated SEO target of 100. `Footer.astro:59` feeds the same
value into the footer watermark, which renders blank.

The page title is **not** affected: `BaseLayout.astro:64` hardcodes `שיר אמיתי` rather than
reading the file. Worth its own look sometime — `AGENTS.md` §5 calls `site.toml` the single
source of truth for the brand name — but it is what stops this finding being worse.

**Not confirmed on a build.** A preview was synced for the empty-brand draft and Vercel created
no deployment for it; the rate limit is out of scope for this session by agreement. The impact
above is read from the site's source, and is stated as such.

**The fix is small**: have `SiteDetails.tsx` apply `field.required` the way `TomlForm.tsx:71`
already does, and reuse its message. The broader point is worth one line in `site-fields.ts`:
a screen that renders the model by hand owes every property in it, not the three it happened to
need.

### Also confirmed in round 11

- **`R9-1`** — rename onto an existing post still 409, missing source still 409.
- **Permission boundary** — five write probes, two read probes, all 403; no cookie 401s; a legal
  file still undeletable (400).
- **`G-11` discard** — two discards, both verified byte-identical to `master`, including the one
  that put the brand name back.
- **`TomlForm` honours `required`** — emptying `hero.title` on the home screen disables save and
  names the field. That is the control this finding is measured against.
- **Accessibility** — no contrast failure, no unnamed control, nothing under 44 px, no heading
  jump, one `h1`, `lang="he" dir="rtl"`, no horizontal overflow.

---

## 3. Round 10 — the run-9 fixes

> `R10-1` was fixed at the root in `9a6aed1` and re-tested in run 11 (§2). Kept as written.

`0be0269` is live: the deployed bundle carries the new help constant, and the row-control labels
render interpolated. `pnpm test` green at **630** across 26 files (was 607/23); `pnpm check` and
`pnpm build` clean.

| Finding | Severity | Verdict |
|---|---|---|
| `R9-1` `rename` overwrites an existing file | MEDIUM | **Fixed** — 409, and the victim is untouched |
| `R9-2` emptied social URL becomes a dead link | MEDIUM | **Fixed** on the site; the editor's half missed (`R10-1`) |
| `R9-3` repeated row controls unnamed | LOW | **Fixed** on all three screens |

### R9-1 — fixed, both halves

`renameFile()` now reads the branch head and refuses before writing anything:

| Probe | Run 9 | Run 10 |
|---|---|---|
| Rename onto an existing post | **200**, occupant destroyed | **409 `exists`** |
| Rename from a path that does not exist | **502** | **409 `missing`** |
| Rename to a dotfile / outside the allowlist | 403 | 403 |

The victim was read back from both `content-draft` and `master` afterwards and is byte-identical;
`pending` stayed empty, so nothing was written at all. `B-13` and `B-14` both close.

### R9-2 — the site is fixed; the editor's half went to the wrong file

`socialLinks()` now filters an empty `href` out of the list, with the reasoning in its own
comment. Verified the way the finding was found — by emptying the field, building a preview, and
reading the built footer:

| | Run 9 | Run 10 |
|---|---|---|
| Footer links | 4 | **3** |
| Empty `href` | **1** | **0** |
| Facebook in the footer | `<a href="">` | **absent** |

That is the half that protects, and it protects a hand edit too, which is where it belongs.

#### R10-1 · The help text never reaches the screen — LOW

The other half was to tell her what clearing the field means. A constant was added to
`screens.ts`:

```
const DROPS_IF_EMPTY = 'אפשר להשאיר ריק - אז הקישור פשוט לא יופיע באתר';
```

and attached to all four social fields there. But `App.tsx:347` special-cases
`screen.id === 'site'` and renders `SiteDetails.tsx`, which carries **its own** `LINKS` array —
where only Facebook has help, and it still reads *"הכתובת המלאה, כמו שמופיעה בדפדפן"*. The new
string ships in the bundle and appears nowhere on the screen; the rendered page contains zero
occurrences of `אפשר להשאיר ריק`.

`social.test.ts` asserts `field.help` is truthy and contains `ריק` — against `screens.ts`. It
passes. A guard that names the behaviour and checks a different object is worth fixing twice:
move the help to `SiteDetails.tsx`'s list, and make the test read what renders.

The underlying shape is the real finding: **two field lists describe the same screen.** The
`screens.ts` entries still earn their keep — `model.test.ts` walks them for the `C-1`/`C-2`
contract — but anything presentational added there for this screen is dead on arrival.

### R9-3 — fixed on all three screens

| Screen | Run 9 | Run 10 |
|---|---|---|
| Blog list | `העברה למעלה` ×5 | `העברת «מה זה צל» למעלה` — 18 labels, all distinct |
| Recommendations | `העברה למעלה` ×15 | 78 labels, all distinct, excerpt truncated with `…` |
| Images | `שינוי תיאור` / `מחיקה` ×30 | `שינוי התיאור של «…»`, `מחיקת «…»` |

The images screen needed a second look. Its 30 replace-image controls still show the same visible
`<label>` text, which reads like the bug unfixed — but each `<input type="file">` now carries an
`aria-label` of `החלפת «‹alt›»`, and `aria-label` is what the accessible name comes from. Fixed.
Where names still repeat there, it is because two images share an alt text, which is content
rather than code.

### Also confirmed in round 10

- **Permission boundary** — seven write probes and three read probes, all 403 with the right verb;
  no cookie 401s. Identical for a maintainer, as it should be: the allowlist is not role-scoped.
- **Legal files** remain undeletable and unrenameable for a maintainer too (400).
- **`A-10.4`, maintainer half** — every locked section editable, 0 of 31 fields disabled, no
  request-change affordance. Against 17 disabled and 3 affordances for the owner in run 6.
- **`X-11` / §7.2, both roles** — a maintainer may reword the consent buttons, but `!`,
  an unbalanced pair and a body missing the cookie sentence are all still refused. The lock is
  "whose decision is this"; the banner rules are "nobody may invalidate consent".
- **`G-11` discard** — three discards, each verified byte-identical to `master`.
- **`R5-1`** — preview status resolved correctly; **`R6-1`** — the preview targeted the right
  page for a `site.toml` edit.
- **Accessibility** — no contrast failure, no unnamed control, nothing under 44 px, no heading
  jump, one `h1`, `lang="he" dir="rtl"`, no horizontal overflow.

---

## 4. Round 9 — a full run from scratch

> All three findings below were fixed in `72c82e2` / `0be0269` and re-tested in run 10 (§2).
> Kept as written.

Planned by re-reading the spec rather than the previous reports, then listing every row no round
had exercised. `pnpm test` green at **607** across 23 files; `pnpm check` clean.

### What had never been tested, and how it went

| Area | Spec rows | Result |
|---|---|---|
| Image upload, downscale, alt gate | `A-3.1` `A-3.2` `A-3.3` | **Pass**, and well |
| Deleting an unreferenced image | `X-4` allow path | **Pass** — first time both directions seen |
| Recommendations: hide, show, relate | `A-7.3` `A-7.4` `A-10.6` | **Pass** |
| The menu: relabel, reorder, header switch | `A-8.3` | **Pass** |
| Social URL validation | `A-8.4` | **Pass** for bad values, **fails for empty** (`R9-2`) |
| Post ordering and pinning | `A-4.6` | **Pass**, against `sortBlogPosts()` |
| Legal `updated` date bump | `A-10.3` | **Pass**, exactly per file |
| The clinic paragraph is editable | `A-10.2` | **Pass** |
| Renaming a post | `A-4.8` | **Pass** in the UI; **fails server-side** (`R9-1`) |
| Hostile Unicode round trip | new, now `F-5a` | **Pass**, byte-perfect |
| Conflict detection | `G-*` | **Not reachable** — see below |

**Image upload (`A-3.1`)** was the strongest single result. A 2.9 MB 4000×3000 JPEG produced the
dialog *"2048×1536 · הוקטנה מ־2.9 MB ל־528 KB"* — downscaled client-side with the size shown
before and after, exactly as the row asks — and committed the file and the manifest entry in
**one commit**. The alt gate is airtight: `הוספה לגלריה` stays disabled with *"צריך לכתוב מה
רואים בתמונה, או לסמן שהיא קישוט בלבד"*, ticking decorative enables it and disables the alt
field, unticking re-blocks it.

Two id-derivation edge cases the spec does not name were tried and both hold: a second file
reducing to a taken id became `qa9-2` with a matching path, and an **all-Hebrew filename**, which
reduces to nothing, fell back to a dated key rather than an empty one. Both are now `A-3.2`.

**Ordering (`A-4.6`)** does something better than the row requires. Moving a dated post above a
pinned one promoted it into the pinned group — writing `order: 1` on it and renumbering the
existing pin to `order: 2` — so the result still matches `sortBlogPosts()` exactly. Two files,
one coherent operation.

**The legal date duty (`A-10.3`)** is precise: editing the clinic paragraph moved
`accessibility.toml`'s `updated` from `2026-09-07` to today and left `terms.toml` at
`2026-09-22`. Only the edited file changed.

**Unicode.** A post carrying bidi marks and isolates, zero-width space and joiner, niqqud, a ZWJ
emoji, NBSP, soft and non-breaking hyphens, and both NFD and NFC forms of the same letter went
through parse → editor → serialize **byte-identical**. Notably NFD was *not* normalised: content
is preserved as typed, while the path allowlist still requires NFC. That distinction is now
`F-5a`.

### R9-1 · `rename` overwrites an existing file — MEDIUM

Renaming a post onto a path that is already occupied returns **200** and replaces the occupant.
Observed directly: `מה-זה-צל.mdx` (2,466 bytes, a real published post) was replaced in the draft
by a 100-byte test file. Nothing warned, and the pending tray showed it only as `modified`.

The editor does check — `MdxEntry.tsx` lists the directory first and refuses with *"כבר יש פוסט
בכתובת הזו. צריך לבחור כותרת אחרת."*, which was confirmed live and writes nothing. So the owner
cannot reach this. But the guard lives **only** in the client, and §5.3 says in its own words
that the proxy is the permission model, tested "against the real proxy, not a mock". This is the
same shape as `R3-1` was, with a worse consequence: that one created a stray file, this one
destroys an existing one.

It is recoverable — discard restored the post byte-exactly, and nothing was published — so this
is robustness, not a security hole against a two-login allow-list. New rows `B-13` and `B-14`
record it, the second because renaming a *missing* source returns a bare 502 from the layer
underneath rather than a reason.

### R9-2 · An emptied social URL becomes a dead link on every page — MEDIUM

Clearing the Facebook field is permitted: save stays enabled, no message appears, and the file
receives `facebook_url = ""`. The site has no guard anywhere along the path — `socialSchema`
types it as a plain `z.string()`, `socialLinks()` returns all four entries unconditionally, and
`Footer.astro` maps them straight into `<a href={link.href}>`.

Confirmed on a real preview build:

```
{"href":"","aria":"פייסבוק - נפתח בטאב חדש"}
```

An empty `href` reloads the current page, in the footer of every page, under an accessible name
promising a new tab. This is the one finding reachable by an ordinary action — dropping a
platform is a normal thing to do — and it is the mirror image of `X-4`, which guarantees she
cannot author a dangling *image* reference. The same guarantee does not cover link fields.

The honest fix is on both sides: the site should skip an empty `href`, and the editor should say
what clearing the field means. Recorded as `V-6`.

### R9-3 · Repeated row controls do not name their row — LOW

| Screen | Label on the up-arrow |
|---|---|
| Menu | `העברת «בית» למעלה` |
| Blog list | `העברה למעלה` ×5 |
| Recommendations | `העברה למעלה` ×15 |
| Images | `שינוי תיאור` / `החלפת התמונה` / `מחיקה` ×30 |

Every control has *a* name, so this is not a bare `4.1.2` failure — but a screen-reader user
listing the controls on the recommendations screen hears the same phrase fifteen times with
nothing to distinguish them. The menu screen shows the codebase already knows the pattern.
Recorded as `N-8a`.

### Conflict detection could not be reached

`conflictingPaths()` compares each pending path's blob at the merge base against master's tip, so
a conflict requires **master to move under the draft** — which only an external writer can do,
since every CMS route goes through the draft. Creating one needs a direct push to `master`, and
this session is not permitted to make one.

It is not untested, only not tested *live*: five unit tests cover it against the in-memory git,
and `Preview.tsx` renders the `is-clash` panel. Worth one deliberate attempt whenever someone is
pushing to `master` anyway.

### Everything else, re-confirmed

- **Permission boundary** — dotfiles, traversal, backslash, absolute, `_opt/`, `src/pages/`,
  padded segments all 403 on write; `package.json`, `.env` and `cms/**` 403 on read with the
  correct verb; no cookie 401s. Restoring a `cms/**` path listed in history is refused.
- **Legal locks** — both locked sections refused with their own Hebrew reason; deleting or
  renaming a legal file 400s. The clinic section is editable, as `A-10.2` requires.
- **`G-11` discard** — eight discards this round, every one verified byte-identical to `master`
  afterwards, including the post `R9-1` had clobbered.
- **TOML fidelity** — `nav.toml` kept its comment count, its `href` values and their pairing with
  the labels through a relabel, a header toggle and a reorder; `site.toml`'s `·` separators
  survived a write; `recommendations.toml` round-tripped hide→show byte-identically.
- **`X-4`** — refuses a referenced image and names where it is used; permits an unreferenced one
  and says *"אף עמוד לא משתמש בה כרגע"*.
- **`R6-1`, `R5-1`, `R3-1`, `R3-2`, `R7-1`, `R6-2`** — all still fixed.
- **Accessibility** — no contrast failure, no unnamed control, no heading jump, one `h1`,
  `lang="he" dir="rtl"`, no horizontal overflow, and no control under 44 px beyond the checkbox
  inside its 44 px label.
- **`_example.mdx`** — suspected of being a hidden `R6-1` case, since Astro excludes
  `_`-prefixed files from collections whatever their `draft` flag says. It is not: `Collection.tsx`
  filters `_`-prefixed files out of the list, so the owner cannot open or unhide it.

---

## 5. Round 8 — the last two findings, and the gap run 7 left

> Everything below still holds after run 9. What run 9 added were surfaces no round,
> including this one, had opened.

`bef7249` is live: the deployed bundle carries the new Hebrew strings and `is-given-up` in both
the JS and the CSS. `pnpm test` is green at **607 passed** across 23 files (was 591/22), the
growth being `deploy.test.ts`. `pnpm check` and `pnpm build` are clean.

| Finding | Severity | Verdict |
|---|---|---|
| `R7-1` the deploy screen waits forever | MEDIUM | **Fixed** — terminal state reached and inspected live |
| `R6-2` publish link goes to a vercel.app snapshot | LOW | **Fixed** — `SITE_PUBLIC_URL` set, link verified |
| Site production deployments missing (run 7) | environment | **Resolved** — two productions built this round |
| `A-9.2` a publish reaching `www` | blocked in run 7 | **Passes** — served, then reverted and confirmed gone |

### R6-2 — fixed, and the cause of the delay is worth keeping

`/api/content/start` now returns `siteUrl: "https://www.shir-amitai.com"`, and the deploy
screen's link reads `https://www.shir-amitai.com/contact`: the site's address composed with
`pagesFor`'s page, exactly as `siteLink()` intends.

The variable had been set before run 7's report was written and still did nothing, because
Vercel injects environment variables at deploy time — the running deployment keeps what it was
built with. That is now written down in `cms/README.md` beside the variable table, since a
setting that is saved and has no effect reads exactly like a bug in the feature that wanted it.

### R7-1 — fixed, and here is how it was tested

The fix makes the screen honour a limit the store already enforced. `WATCH_LIMIT_MS`, `settled`
and a new `gaveUp` moved into `src/model/deploy.ts` so the store's "stop polling" and the
screen's "stop promising" cannot drift apart.

Builds are healthy again, so the state could not be reached by waiting. It was reached by
stubbing `Date.now` forward past the limit in the live page — faking only the clock, the way a
unit test would, against the real deployed bundle rather than a local build. Every other input
was real: a real publish, a real watch, the real store.

| | Before the limit | After it |
|---|---|---|
| Heading | *מעלה את השינוי לאתר* | **השינוי פורסם** |
| Body | *מחכה שהבנייה תתחיל… כבר N* | **השינוי נשמר ופורסם. לא קיבלתי אישור שהבנייה באתר הסתיימה, אז כדאי להיכנס לאתר ולראות.** |
| Advice | stay or keep working | **אם השינוי לא מופיע באתר בעוד כמה דקות, שווה לפנות לאיתיאל עם השעה שבה פרסמת.** |
| Spinner | 1 | **0** |
| Button | *להמשיך לעבוד* | **חזרה למסך הראשי**, and it clears the watch |
| Card class | `is-none` | `is-none is-given-up` |
| Site link | absent | **`https://www.shir-amitai.com/contact`** |

The link appearing here is the part worth calling out: the copy tells her to go and look, and
now there is a button that does it. It falls out of the existing guard rather than new logic —
`siteLink()` returns the deployment URL when the site's address is unknown, and in this state
there is no deployment, so the link is defined exactly when it points somewhere real.

**The bar chip was the half that had been missed.** It spins on every *other* screen, and once
polling stops nothing re-renders it at all. It now carries its own interval and settles to
**פורסם** with no spinner and `is-given-up`. That interval is 30 seconds, so the chip can lag
the card by up to half a minute — deliberate, since the limit is ten minutes and this runs on
every screen, and confirmed by measurement: unchanged at 2.5 s after the clock jump, flipped by
35 s.

`deploy.test.ts` adds 16 tests around the predicates, including that `gaveUp` never overrides a
`ready` or `failed` that already reported, and the 150-minute reading that started this.

### Also re-confirmed in round 8

- **`R6-1`** — the preview opened on `/contact` for a `contact.toml` edit, twice, on two
  separate builds. `pagesFor`'s mapping still holds for a non-blog path.
- **`R5-1`** — every status this round resolved `why: site` with the correct `resolved` block.
- **`R3-1` and the verb fix** — six write probes and three read probes, all 403, each with the
  right verb and reason. `B-9` 401s with no cookie.
- **`G-12` restore** — `contact.toml` restored from `06bbe1c`, the marker gone, then published;
  `www` confirmed clean afterwards.
- **`G-13` / `G-14`** — three preview builds, each within seconds of its sync; no build for a
  save.
- **`vercel-ignore.sh`** — the content publish produced exactly one deployment,
  `Production – shir-amitai`; the CMS project skipped it. The `cms/`-only commit `06bbe1c`
  produced the mirror: `Production – shir-website-editor` only.
- **Legal lock** — both locked sections refused with their own Hebrew reason; deleting and
  renaming a legal file both 400.
- **`R6-3`** — date input 690 × 51, switch label 647 × 44, tag chip button 44 × 44. The only
  control under 44 px is the 24 × 24 checkbox inside that clickable label.
- **Accessibility** — no contrast failure, no unnamed control, no heading jump, one `h1`,
  `lang="he" dir="rtl"`, no horizontal overflow.

---

## 6. Round 7 — the run-6 findings, re-tested

`8e235e7` is live: the deployed bundle carries the new Hebrew absence strings, `is-absent` and
`.switch label`. `pnpm test` is green at **591 passed** across 22 files (was 528/19) and
`pnpm check` is clean. The growth is `toml-fuzz.test.ts`, which closes the half of `F-18` that
run 6 listed as outstanding: 32 tests putting a hostile value in every slot of every TOML file
the owner can reach.

| Finding | Severity | Verdict |
|---|---|---|
| `R6-1` preview shows a 404 and calls it ready | MEDIUM | **Fixed** — all three cases, plus a page picker |
| `R6-3` controls below the 44 px target | LOW | **Fixed** — all three measured at or above 44 |
| `R6-2` publish link goes to a vercel.app snapshot | LOW | **Fixed in code, not in production** — `SITE_PUBLIC_URL` unset |
| read rejection said "refusing to write" | cosmetic | **Fixed** — `read` / `write` / `move` |
| `F-18` TOML half | gap | **Landed** — 32 fuzz tests over all six TOML files |

### The site stopped building, and that shaped the round

*Resolved in run 8, without a repository change — see §2.*

Both of run 7's publishes produced **no** `Production – shir-amitai` deployment. The last one
was `98ef370b` at 10:12 UTC, and four preview deployments in the same window built normally, so
it was not quota. Replaying `vercel-ignore.sh` locally against every plausible
`VERCEL_GIT_PREVIOUS_SHA` returned *build*, so it was not the ignore step either. Nothing
visible from outside Vercel explained it.

Two consequences ran through the round: `A-9.2` could not be observed, and `R6-2` could not be
watched end to end. A third was more useful — it is what exposed `R7-1`, since the screen spent
two and a half hours insisting a build was still coming.

### R6-1 — fixed, in all three shapes

The fix is a new `src/model/pages.ts`: a path becomes the page it produces, and a page the build
will not have becomes its listing plus an explanation. Tested live, each case its own build:

| Case | Iframe target | Panel |
|---|---|---|
| New post, hidden (the default) | `/blog` — renders the real listing | *"…מוגדר כרגע כמוסתר, ולכן הוא לא מופיע באתר ואי אפשר לראות אותו כאן. אפשר להדליק «מוצג באתר» בעמוד הפוסט ולחזור לכאן."* |
| Same post, made visible | `/blog/qa7-סיבוב-שביעי` — the post itself | none, correctly |
| A deletion | `/blog` | *"…נמחק, ולכן הוא כבר לא באתר. זו הרשימה שהוא ירד ממנה."* |

Both explanations say what is missing, why, and — for the hidden case — exactly which switch to
flip. That is more than the finding asked for, which was only "do not show a 404 and call it
ready".

**The picker is new and was not requested.** With two files changed in one session
(`contact.toml` and `psychotherapy.mdx`) the screen offered two buttons, opened on `/contact`,
and switched to `/psychotherapy` on demand. Both pages returned 200 from the preview build and
both carried the edit, so the TOML and MDX write paths are confirmed on a real build at the same
time. `sitePathFor`'s table was checked against `src/pages/`: every route it names exists.

### R6-3 — fixed

| Control | Run 6 | Run 7 |
|---|---|---|
| Tag-remove `✕` button | 28 × 28 | **44 × 44** |
| `מוצג באתר` checkbox | 22 × 22 box, no 44 px row | **24 × 24 box inside a clickable 647 × 44 label** |
| `תאריך` input | 119 × 21 | **690 × 51** |

A full sweep of the post editor now reports no interactive control under 44 px, and the home
screen audit is clean on every axis: no contrast failure, no unnamed control, no heading jump,
one `h1`, `lang="he" dir="rtl"`, no horizontal overflow.

### R6-2 — the code is right, the deployment is not configured

*Resolved in run 8: the variable was set and the project redeployed (§2).*


`siteLink()` prefers `SITE_PUBLIC_URL` + the changed page and falls back to the deployment URL,
which is the correct shape and has its own test file. But the deployed CMS does not have the
variable:

```
POST /api/content/start  →  {"draft":…,"pending":[],"role":"owner","login":…,"repo":…}
                            no "siteUrl" key
```

The same deployment contains the new `pages.ts` strings, so this is not a stale build — the
environment variable is simply missing. `cfg.siteUrl` is `undefined`, the key is dropped from
the JSON, `store.siteUrl` is undefined, and `siteLink()` returns the deployment URL exactly as
before. **This is one Vercel setting away from done**, and worth adding to `cms/README.md`'s
variable list so the next deployment does not repeat it.

### New in round 7

> `R7-1` was fixed in `bef7249` and re-tested in run 8 (§2). Kept as written.

#### R7-1 · The deploy screen waits forever — MEDIUM

Publishing moves `master` and then watches for the site's build. When that build never appears,
the screen counts up with no upper bound and no change of message. Observed live:

```
מעלה את השינוי לאתר
מחכה שהבנייה תתחיל… כבר 150 דקות.
אפשר להישאר כאן או להמשיך לעבוד - הסטטוס ימשיך להופיע בסרגל העליון.
```

The browser and the CMS server agreed on the time to the second, so the 150 minutes were real.

`Deploy.tsx` handles `ready`, `failed` and `unknown`; `unknown` even says the reassuring thing
(*"לא הצלחתי לקבל מצב בנייה. השינוי נשמר, וכדאי לבדוק באתר בעוד דקה."*). The state reached here
is `none` — no deployment exists at all — and it has no terminal branch, so the one case where
nothing is coming is the one case the owner is told to keep waiting. Her content is safe and the
top-bar status persists, so this costs confidence rather than work; but "כבר 150 דקות" under a
spinner is the screen telling her something untrue.

Suggested shape: after a couple of minutes with no deployment, say the same thing `unknown`
says. The publish succeeded either way, and that is the fact worth putting on screen.

### Also re-confirmed in round 7

- **`R3-1`** still holds: `src/content/.hidden.toml` is refused on write *and* on read.
- **The verb fix.** Reads now say *refusing to read*, writes *refusing to write*, and a bad
  branch *refusing to move*.
- **`R5-1`** stays fixed: every status this round resolved `why: site` with the correct
  `resolved` block.
- **`G-13`** — four preview builds, each created within seconds of the sync and each serving the
  right content. **`G-14`** — no build for a save.
- **`R3-2`** — the two publishes this round read `הוספת הפוסט` and `מחיקת הפוסט`.
- **`G-6`** — publish applied exactly the changed path, both times.
- **`G-11`** — three discards, each verified byte-identical to `master` afterwards
  (`contact.toml`, `psychotherapy.mdx`, and `_example.mdx` restored after a deletion probe).
- **Escaping** — `|`, `~~…~~` and `[text](url)` all survived to a built page as literal text,
  with no `<table>` and no `<del>`; only the bare URL autolinks, as `X-7` records.

---

## 7. Round 6 — the fixes, verified

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

> All three were addressed in `8e235e7` and re-tested in run 7 (§2): `R6-1` and `R6-3` are
> fixed; `R6-2`'s code is merged but needs `SITE_PUBLIC_URL` set in Vercel — which run 8
> confirms was then done. Kept as written.

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
## 8. Round 5 — the build-dependent gap, closed

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

## 9. Round 4 — the preview-build change (`66968c4`)

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

## 10. Round 3 — every run-2 finding re-tested

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

## 11. The owner role — closed at last, and it passes

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

## 12. New in run 3

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

## 13. Regression sweep — everything from runs 1 and 2, re-verified

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

## 14. Acceptance matrix — after run 11

`P` pass · `F` fail · `~` partial · `–` not exercised

Rows below are run 3's full sweep, carried forward, with the rows each later run touched
re-scored. Run 9 exercised many of them for the first time rather than inheriting them.

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
| A-6.2 | **P** | A-7.2 | **P** | A-8.2 | ~ | A-9.2 | **P** | A-10.2 | **P** |
| A-6.3 | **P** | A-7.3 | **P** | A-8.3 | **P** | A-9.3 | **P** | A-10.3 | **P** |
| A-6.4 | **P** | A-7.4 | **P** | A-8.4 | **P** | A-9.4 | **P** | A-10.4 | **P** |
| A-6.5 | ~ | A-7.5 | ~ | A-8.5 | **P** | A-9.5 | ~ | A-10.5 | **P** |
| | | | | | | | | A-10.6 | **P** |

**Tally — 52 P · 0 F · 6 ~ · 0 – · 0 ⊘**
(run 10: 53 P · 0 F · 5 ~ — run 9: 51 P · 0 F · 7 ~ — run 8: 53 P · 0 F · 5 ~ —
run 7: 52 P · 0 F · 6 ~ — run 6: 52 P · 0 F · 6 ~ — run 5: 50 P · 3 F · 5 ~ —
run 3: 50 P · 0 F · 6 ~ · 2 ⊘ — run 2: 45 P · 0 F · 7 ~ · 1 – · 3 ⊘ —
run 1: 34 P · 6 F · 15 ~ · 3 –)

**A-8.2 moves to partial.** Its own wording is "name and tagline edited; the `·` separator
survives", and both halves pass — the row is downgraded for what it does not say. `V-2` requires
a required field to be refused empty *by the CMS*, these two fields are declared required, and
this screen accepts them empty (`R11-1`). Scoring the row `P` would record the separator surviving
while the field it separates can be blanked.

`A-8.4` stays `P`: link validation is correct in both directions, and the emptied-link behaviour
it was downgraded for in run 9 is fixed.

The other five partials are the long-standing structural ones (`A-3.5`, `A-6.5`, `A-7.5`,
`A-9.1`, `A-9.5`), each needing a tool, a second account, or an enumeration this suite has not
been asked for.

### Guarantees

| | | | | | |
|---|---|---|---|---|---|
| X-1 **P** | X-2 **P** | X-3 **P** | X-4 **P** | X-5 **P** | X-6 **P** |
| X-7 ~ | X-8 **P** | X-9 **P** | X-10 **P** | X-11 **P** | X-12 **P** |
| X-13 **P** | X-14 **P** | X-15 **P** | X-16 ~ | R-1 **P** | R-2 **P** |

X-3 now passes: the generated-document properties landed and were confirmed live — a second
save writes the same bytes, every block stays its own block, and no heading, list, table or
rule appeared on `www` that was not asked for. X-7 partial: link syntax neutralised, bare-URL
autolink remains, now recorded in the spec as a GFM property rather than a defect (`R2-3`).
X-10 holds: the gate works, and what she is shown before publishing is a page the build really
has. X-16 partial: the only Latin in the UI is GitHub author logins in history and the
`Enter` / `Shift + Enter` key names.

Both remaining partials are decisions rather than defects, and both are recorded as such in the
spec.

---

## 15. Still not verified

| Area | Reason |
|---|---|
| **The owner-side legal locks** | Runs 10 and 11 both ran as `maintainer`, for whom the locks lift by design. The code is untouched since run 9, which verified them as `owner`. Two rounds of inheritance now, and worth one owner-session probe. |
| **Build parity, and `R11-1`'s site impact** | Vercel created no deployment for this round's preview — the rate limit, out of scope by agreement. Parity rests on run 8; `R11-1`'s effect on the JSON-LD and the footer watermark is read from the site's source rather than from a built page. |
| **Conflict detection, live** | Needs `master` to move under a pending draft, which only an external writer can do; this session may not push to `master`. Five unit tests and the `is-clash` panel cover it otherwise. |
| **`R7-1`'s terminal state, unfaked** | Reached in run 8 by stubbing `Date.now` past the limit; everything but the clock was real. |
| **`axe` (N-5)** | The CMS's own CSP blocks loading axe-core. Substituted a scripted audit, which is what found `R6-3` and `R9-3`. |
| **N-16 / N-17 on 4G** | No throttling available. Eager payload is 174 KB across two chunks. |
| **B-10** | Needs a second, non-allow-listed GitHub account. |
| **B-11** | Verified by code: the cookie is AES-256-GCM sealed, HttpOnly, Secure, SameSite=Lax, so tampering fails the auth tag. |

---

## 16. Repository state — clean

```
git diff --name-status 9a6aed1 origin/master -- src/content public/img
  (empty — content byte-identical to the round-11 baseline)
```

- **Round 11 published nothing**, as rounds 9 and 10 did not. `master` has not moved since the
  fix commit and `www.shir-amitai.com` was never touched.
- Two discards undid everything written: `site.toml` twice, each verified byte-identical to
  `master` afterwards — including the save that blanked the brand name, which is the one write
  this round that would have mattered.
- Every rename and allowlist probe was refused before writing, so they left nothing behind.
- `git ls-tree` on master shows no `qa9`, `qa10`, `qa11` or `TAMPER` residue.
- `pending` and `conflicts` are both empty; `content-draft` content matches `master`.
- The working tree is clean; run 10's report edits landed in `9a6aed1`.

---

## 17. Suggested order of work

1. **R11-1** — apply `field.required` in `SiteDetails.tsx` the way `TomlForm.tsx:71` already
   does, and reuse its Hebrew message. The one-line version fixes the two brand fields; the
   version worth writing makes the bespoke screen consume every property the model carries, so
   the next property added there is not invisible in the same way `help` was in `R10-1`.
2. **An owner-session probe of the legal locks.** Two rounds running they have been inherited
   rather than observed, because both were signed in as the maintainer. It is a compliance
   control and the cheapest item on this list.
3. **`BaseLayout.astro:64`** — the page title hardcodes `שיר אמיתי` instead of reading
   `site.brand.name`, which `AGENTS.md` §5 calls the single source of truth. It is what kept
   `R11-1` from reaching the title, so fixing it without fixing `R11-1` first would make things
   worse, not better. Informational, and order matters.
4. **A conflict test, next time someone pushes to `master`.** The mechanism has unit tests and a
   UI panel but has never been seen working end to end.
5. **`X-7` / `R2-3`** — unchanged, still a decision rather than a defect.
6. **The gaps in §15 that need tools** — `axe` proper, 4G throttling, a second GitHub account.

**On the shape of the last two rounds.** `R10-1` and `R11-1` are the same bug wearing different
clothes: a screen that renders the model by hand, and a property of the model it does not read.
The fix for `R10-1` removed the duplicate list, which was the right move and is why `R11-1` is a
missing line rather than a second list. A test that asserts the bespoke screen honours every
flag the model sets on its fields would close the family rather than the instance.
