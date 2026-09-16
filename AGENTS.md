# AGENTS.md - Shir Amitai Website

Operational guide for developers and coding agents. It describes the repo as it is; where it and the code disagree, the code wins.

## 0. The rules about words

**This file stays under 200 lines, forever** - it loads into every session in this repo, so space here is taxed on all of them. An addition is a trade, never an append: name what it displaces and cut that first.

**Weight by frequency, not recency.** A deep session makes its own subject feel fundamental; it rarely is. Most findings earn a clause, some a line, few a section.

**Comments are taxed the same way.** Read a file's header comment before changing it; hold new ones to the same bar:
- Restating the code or labelling a block: delete, don't shorten.
- **Never a changelog** - no "previously", no what a session tried or measured, no arguing with the reader. Reasons in the present tense, as facts.
- Earn one only where a simpler alternative exists that a maintainer would plausibly "fix" the code back to - then say why that is wrong, briefly.
- Hebrew comments in `src/content/` instruct the owner, not a maintainer: keep them accurate.

## 1. Project overview

Static website for **שיר אמיתי**, a holistic therapist (פסיכותרפיה · טיפול במגע · פתיחת קול). Hebrew-only, fully RTL, watercolor-themed, calm scroll choreography. Live at `https://www.shir-amitai.com`.

**Stack:** Astro 4 (static) · MDX · Lenis + GSAP/ScrollTrigger · smol-toml + Zod · astro-icon · sharp (build-time) · pnpm 9.

**Non-negotiable constraints** (failing any is a regression):
1. **Hebrew-only** copy. The only Latin permitted on rendered surfaces: `mailto:`/`tel:`/`wa.me` hrefs and the visible email/phone strings, `©` + year digits, and the footer builder credit (§7).
2. **RTL-native** - `<html lang="he" dir="rtl">`, logical CSS properties, mirrored directional icons (§4.4).
3. **Fully responsive**, 320 px to ultra-wide, no horizontal scroll at any width. Fluid `clamp()` type and spacing rather than per-breakpoint overrides; touch targets ≥ 44 px; test at 320 / 375 / 768 / 1280 / 1600.
4. **Static output only** - no backend, no server functions, no runtime APIs. Fonts self-hosted. The only third-party origin is Google Analytics, and it loads *only* after an affirmative opt-in (§12); nothing else may be added.
5. **WhatsApp → Phone → Email** ordering everywhere a contact action surfaces (§9).
6. **WCAG 2.1 AA**, including the in-page motion mechanism (§8) and the published accessibility statement (§10).
7. **Targets:** Lighthouse Perf ≥ 95, A11y = 100, SEO = 100. Home **first-party** JS ≤ 60 KB gz (nearly all GSAP + Lenis). `gtag.js` is ~90 KB gz on its own and is excluded from that budget - it is async, loads only for visitors who opted in, and must never become render-blocking or a precondition for anything on the page.

## 2. Repository structure

```
src/
├── components/
│   ├── layout/    # BaseLayout, Header, Footer, ContactPill, BackgroundField, MotionToggle
│   ├── ui/        # GlassCard, SoftImage, SectionHeading, ScrollReveal, ParallaxLayer,
│   │              #   BreathDivider, CTAButton, Icon, RecommendationText
│   ├── home/      # IdentitySection, TherapyTeaser, BlogTeaser, RecommendationsSection
│   ├── therapy/   # TherapyPage - shared template for all three modalities
│   └── legal/     # LegalPage - shared template for accessibility + terms
├── icons/         # optimized single-color SVGs (astro-icon iconDir)
├── content/       # see §5
├── lib/           # content.ts (TOML loader), seo.ts, blog.ts, recommendations.ts,
│                  #   screenshots.ts, images.ts (derivative manifest)
├── pages/         # index, about, contact, 404, recommendations, accessibility, terms,
│                  #   psychotherapy, shiatsu, voice, blog/index, blog/[slug]
└── scripts/       # lenis-init.ts, scroll-reveal.ts, parallax.ts, home-scroll.ts
public/
├── global.css     # THE stylesheet - see §4.1
├── fonts/         # self-hosted Heebo (hebrew + latin subsets)
└── img/           # bg/ · content/ · recommendations/ · og-default.jpg
    └── _opt/      # GENERATED derivatives + manifest.json (§6.1)
scripts/optimize-images.mjs · .github/workflows/images.yml    # both §6.1
```

Root: `astro.config.mjs`, `tsconfig.json` (`@/*` → `src/*`), `package.json`, `pnpm-lock.yaml` (committed), `.nvmrc`, `vercel.json` (cache headers only - §10.1).

Not part of the build:
- `editor-guide/` - a standalone Hebrew HTML guide teaching Shir to edit content through the GitHub web editor. **Update it whenever you change the shape of something an owner edits** (TOML keys, frontmatter fields, folder layout).
- `log/` - the original design spec and brief, kept as a historical record of intent. A record of intent, not a description of the current code, and wrong in places (§6.1).
- `coming-soon-page/` - the retired placeholder landing page.

## 3. Getting started

Node ≥ 20 (`.nvmrc`), pnpm 9 (pinned via `packageManager`). No `.env` - the site has no secrets.

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # → dist/
pnpm preview    # serve dist/ locally
pnpm check      # astro check (types + content schemas)
pnpm images     # rebuild derivatives - CI does this on push (§6.1)
```

`pnpm check` and `pnpm build` must both pass, clean, before any change is done.

## 4. Design system

### 4.1 Where CSS lives - read before touching any style

**`public/global.css` is the site's stylesheet.** Authored by hand and shipped verbatim: not bundled, not minified, not processed by Vite. No `@import`, no PostCSS, no compiler-dependent nesting. It holds, in order: `@font-face` → **design tokens** → **themes** → reset → typography → RTL → utilities → styles for `GlassCard`, `SectionHeading`, `SoftImage`, `CTAButton`, `ContactPill` → **the accessibility block, which must stay last** (it wins by source order instead of `!important` on every rule).

Everything else lives in scoped `<style>` blocks inside the `.astro` component that owns it - those *are* bundled, and `astro.config.mjs` inlines them rather than emitting `<link>`s. `BaseLayout` reads `global.css` at build time and **inlines it ahead of those blocks**, which is the source order the cascade above assumes; the file stays exactly where it is, only the delivery changed. Its header comment says why, and why caching `/global.css` harder is not the alternative (§10.1).

### 4.2 Tokens & theming

All visual constants are CSS variables in the token block of `global.css`: colors, font scale, spacing, radii, motion, breakpoints. **Never hardcode** a color, size, duration or easing in a component - add a token, then reference it.

Modality accents are registered in the themes block as `[data-theme="…"]` and selected via `data-theme` on `<body>` (via `BaseLayout`'s `theme` prop) or on a `<section>`. Theme-sensitive styles read `var(--accent)` / `var(--accent-soft)` - never a hardcoded color. Adding a modality means adding a `[data-theme]` row there.

### 4.3 Typography

Two roles, one webfont. `--font-display` is **Heebo**, the only downloaded face, self-hosted as a variable font in `public/fonts/`; it carries wordmarks, titles, kickers and blockquotes. `--font-sans` is the visitor's own system UI font and carries body and UI text - deliberately not a webfont. Do not introduce Google Fonts or any other external origin. Always reference a family through its token.

**Hebrew emphasis is weight, not slant** - `*text*` and any bare `<em>` render at 600; only `_text_` opts into real italic, tagged by `scripts/remark-underscore-italic.mjs` and slanted synthetically (Heebo ships no italic face). Sizes via `clamp()` from the token scale. Western digits only. **U+0020 belongs to the hebrew `@font-face`**, carved out of the latin `unicode-range` so the later rule cannot win the overlap - otherwise every Hebrew heading waits on the latin file, which cost CLS 0.189 on `/about`. `global.css` has the account; don't tidy those ranges back.

### 4.4 RTL - RTL-native, not RTL-patched

- **Logical properties only**: `margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `text-align: start/end`. Never `margin-left/right` or `text-align: left/right`.
- Let `dir="rtl"` flow do its work - don't fight it with `row-reverse`.
- For directional transforms multiply by `--dir-x` (`-1` in RTL) instead of hardcoding a sign; see `.contact-pill` in `global.css`.
- Mirror directional icons: "next" points left ←, "back" points right →. The mobile drawer is pinned to `inset-inline-end` and slides in from the **left** in RTL - the same edge as the hamburger, so it reads as coming out of the tap target.
- Rare LTR islands (email/phone strings, builder credit) wrap in `dir="ltr"`.

## 5. Content & data layer

Editable content lives in `src/content/` and is parsed at build time. **Components are dumb renderers** - they take props and never embed Hebrew copy (an overridable Hebrew default on a prop is fine).

- **TOML** for structured content, loaded through `loadToml('path', schema)` (`src/lib/content.ts`). Each page declares its own Zod schema inline in its frontmatter.
- **Astro content collections** for `therapies` and `blog`, both `.mdx` with **YAML frontmatter**. **`src/content/config.ts` is the authoritative schema** - read it rather than trusting any list of fields elsewhere. A mismatch fails the build with a clear error.
- `remark-breaks` is on, so a single newline in body copy - or in a multi-line frontmatter string - renders as a line break. Copy keeps its typed shape without `<br>`.
- Comments in the TOML files are Hebrew instructions aimed at the owner. Keep them accurate and keep them Hebrew.

| File | Holds |
|---|---|
| `site.toml` | **The single source of truth for brand name and contact details.** `seo.ts` and every layout component read it - never hardcode a phone number, address or URL. |
| `nav.toml` | The single source of truth for page names and their order, for **both** the header and the footer. `header = false` makes an item footer-only. |
| `images.toml` | Image manifest: stable id → `file` under `public/`, Hebrew `alt`, optional `credit`. Components take an **id** and render via `SoftImage`, never a raw path. This is why alt text is content, not a prop. |
| `recommendations.toml` | Self-contained recommendations - screenshot path, alt, transcription, `relatedTherapies`, `active`. **File order is display order**; `loadRecommendations()` preserves it and callers must not re-sort. Retire one with `active = false` rather than deleting it. |
| `pages/*.toml` | Per-page copy: home, about, contact, 404, accessibility, terms. |
| `therapies/*.mdx` | One per modality; filename is the slug and the URL. |
| `blog/*.mdx` | Hebrew filenames. Ordering is centralized in `sortBlogPosts()` (`src/lib/blog.ts`) and shared by the blog index and home teaser - never re-sort at a call site. |

`src/lib/screenshots.ts` measures recommendation screenshots with `sharp` at build time so every card renders its text at the same apparent size regardless of which phone took the capture. Its header comment explains the thresholds; read it before touching them.

**Adding a modality** touches four places: the `accent` enum in `config.ts`, a `[data-theme]` row in `global.css`, `src/content/therapies/<slug>.mdx`, and a 3-line `src/pages/<slug>.astro` wrapper. Add a `nav.toml` entry and the home triptych and footer pick it up automatically.

## 6. Components

UI primitives (`ui/`, `layout/`) are the building blocks; page-level components compose them. **Pages never define visual primitives.** Each component's header comment states its contract - consult it rather than guessing.

- **SoftImage** is the only sanctioned image renderer: takes an image **id**, applies the watercolor mask, sources `alt` from the manifest. Still size and optimize originals before committing - §6.1 shrinks files, it does not crop or art-direct.
- **CTAButton** variants map to the §9 priority: `primary` = WhatsApp, `secondary` = phone, `tertiary` = email / read-more.
- **Icon** takes either `label` (→ `role="img"`) or `decorative` (→ `aria-hidden`). New icons: single color, `stroke="currentColor"`, no fills, `stroke-width="1.5"`, rounded caps.
- **ContactPill** and **BackgroundField** are singletons - reuse, don't reimplement.
- **TherapyPage** and **LegalPage** are shared templates; their pages are thin wrappers. Add a page of that kind by adding a wrapper, not a new template.
- **MDX body components** are passed in via `<Content components={{ SoftImage }} />` in `TherapyPage.astro` and `blog/[slug].astro`. To use another component inside body copy, add it to both maps.

### 6.1 Responsive images

`pnpm run images` (`scripts/optimize-images.mjs`) writes AVIF/WebP derivatives of every `images.toml` and `recommendations.toml` source into `public/img/_opt/`, plus a manifest. Derivatives are **committed**, and `.github/workflows/images.yml` rebuilds and commits them on every push touching an image - so an owner uploading through the GitHub web editor never runs anything. `src/lib/images.ts` is the only place derivative URLs are constructed. Four rules, each explained in full by the header comments:

- **Filenames carry the source digest.** That is what makes `_opt/` safe to cache immutably (§10.1) and what makes the script idempotent in CI, where mtimes are meaningless.
- **`imageSources()` re-checks that digest and serves the original on a mismatch.** Hashing does *not* make this redundant - it covers the window before the workflow catches up. Remove neither.
- **`sizes` describes the slot, but `object-fit: cover` paints wider than the slot.** SoftImage corrects for it from the intrinsic ratio; just pass the true slot width.
- **A full-bleed cover layer needs the native width on every viewport** - hence `largestSources()` and no srcset in BackgroundField.

`astro:assets` is not available for this: it only processes images resolvable as **ES modules**, and `images.toml` stores `public/` path strings, which `<Image>` refuses outright. That was never actually decided - `log/plan.md:219` asked for both halves, which cannot hold - so treat migrating as open rather than settled.

## 7. Hebrew-only & the builder credit

Titles, meta, OG/Twitter, JSON-LD strings, `alt`, `aria-label`, buttons and links are all Hebrew; blog slugs too (URL-encoded UTF-8 in the sitemap). The one intentional English string is the builder credit in `Footer.astro` - hardcoded there rather than in TOML, wrapped in `lang="en" dir="ltr"`, styled subtly. Leave it as it is.

## 8. Animation & the motion mechanism

**Lenis** drives inertial scroll (`lenis-init.ts`); **GSAP + ScrollTrigger** handles scrubbed timelines (`home-scroll.ts`) through `ScrollTrigger.scrollerProxy`. Simple reveals use IntersectionObserver (`scroll-reveal.ts`) and parallax is a plain scroll handler (`parallax.ts`) - reach for GSAP only when you need scrub or pin. View Transitions are deliberately absent; `BaseLayout`'s header comment explains why. Don't reintroduce them without solving that.

**Hard rules:**
- Animate `transform` / `opacity` only - never `top` / `left` / `width` / `height`.
- `will-change` only on currently-animating elements.
- Use motion tokens (`--dur-*`, `--ease-*`) - never raw values.
- Every animation needs a `prefers-reduced-motion: reduce` fallback (≤ 200 ms, opacity-only). Every script above bails out entirely under that query. Test it.

**The in-page mechanism (WCAG SC 2.2.2 / ת"י 5568 חלק 1)** - several animations loop indefinitely, so an OS-level preference alone is not enough. `MotionToggle` sets `data-motion="off"` on `<html>` and persists it; an inline script in `BaseLayout`'s `<head>` restores it before first paint; the `[data-motion="off"]` rules are the last block in `global.css`. **Any new indefinitely-looping animation must be covered by that block** - verify by toggling.

**No-JS safety net:** `[data-reveal]` starts at `opacity: 0` and is revealed by IntersectionObserver, so `<html class="no-js">` keeps it visible when JS is off. Never ship reveal-gated content without that path.

## 9. Contact-channel priority

**WhatsApp → Phone → Email**, in HTML source order, tab order and visual emphasis (`primary` / `secondary` / `tertiary`). Single-action contexts always use WhatsApp - so do the collapsed ContactPill and the first `Person.contactPoint` in JSON-LD. The details live in `site.toml` `[contact]` and are read from there; never restate them in code.

## 10. Accessibility, SEO, performance

**Accessibility (WCAG 2.1 AA, Lighthouse = 100):** semantic HTML; one `<h1>` per page and no skipped heading levels; keyboard-reachable controls with visible focus rings; Hebrew `aria-label` on icon-only buttons; meaningful `alt` (or `alt=""` for decorative); contrast ≥ 4.5:1 body, ≥ 3:1 large; skip link; hit targets ≥ 44×44 px; `prefers-reduced-motion` honored; the §8 motion toggle present. Test with keyboard and a Hebrew screen reader.

The site publishes a formal **הצהרת נגישות** at `/accessibility` (required by תקנה 35), which must describe the site as it actually is: **any change affecting accessibility requires updating `src/content/pages/accessibility.toml`, including its `updated` date.** `terms.toml` carries the same duty for anything touching privacy (§12).

**SEO:** unique Hebrew `<title>` ≤ 60 chars (`BaseLayout` appends `" | שיר אמיתי"`), 140-160-char description, canonical, OG + Twitter with `og:locale="he_IL"`, `hreflang="he"`. JSON-LD comes from `src/lib/seo.ts`: `Person` + `HealthAndBeautyBusiness` on home, `Service` on therapy pages, `BlogPosting` on posts. `sitemap.xml` is generated by `@astrojs/sitemap`.

**Performance budget (home, gzipped):** HTML + critical CSS ≤ 30 KB · JS ≤ 60 KB · LCP image ≤ 120 KB · above-the-fold ≤ 250 KB. **The LCP element on every page is BackgroundField's `<img>`** - markup rather than a CSS background so the preload scanner finds it, carrying `fetchpriority="high"`. Reverting either costs ~25 mobile Lighthouse points, measured. Run `pnpm build && pnpm preview` + Lighthouse before finishing any change to home or a shared layout.

### 10.1 Caching

`vercel.json` holds cache headers and nothing else. It grants `immutable` to `/img/_opt/*` and `/fonts/*` alone, because only those URLs are content-addressed - `_opt` by digest (§6.1), fonts by discipline (**rename the file if you ever replace a font**). Everything else in `public/` is author-named and mutable and must keep Vercel's default `max-age=0, must-revalidate`. **Never add such a path.** A long `max-age` on a stable URL means an edit never reaches anyone who has already visited, `immutable` means not even a reload rescues them, and nothing done from the server reaches a copy in someone's browser.

## 11. Stop and ask

Hardcoding a color, size or contact detail · adding another animation library · adding English copy · adding any third-party origin beyond the one in §12 · loosening the consent gate · switching structured content away from TOML · adding server-side anything · switching off pnpm · adding a contact form · adding i18n or an English version · reintroducing View Transitions.

## 12. Analytics & consent

Two layers, gated differently because the law treats them differently. **Vercel Web Analytics** counts page views for everyone - first-party path, no cookie, no persistent id, no new recipient (the host already sees every request) - so it needs no consent. **GA4** does: it writes `_ga` cookies and sends data to Google outside Israel, and consent is the lawful basis for that transfer, which is why the banner names both. The gate is the network request, not the cookie: nothing is fetched from Google before an affirmative click, and Consent Mode is no substitute, since with defaults denied it still downloads `gtag.js` and pings Google first. `[analytics] enabled = false` in `site.toml` removes tag and banner together.

**`consent.ts` pushes `arguments`, not a rest array.** `gtag.js` identifies its commands by Arguments type and silently discards anything else, so the tidier `(...args) => dataLayer.push(args)` loads the tag, queues every call and records nothing at all. Do not modernize it.

**Instrumentation is declarative** - `data-an-event` plus `data-an-*` parameters, read by one delegated capture-phase listener in `analytics.ts` (capture, because the drawer stops propagation on link clicks); `CTAButton` takes an `analytics` prop. Callers name their own `placement`: the same three contact links appear in eight places, and the pill's fan-out and collapsed trigger must stay `pill` and `pill_trigger` or WhatsApp double-counts. **Changing what is measured is a legal change** - update `pages/consent.toml` (the banner is the first layer of disclosure), the "מדידה וסטטיסטיקה" section of `terms.toml`, and both `updated` dates. The banner's two buttons stay identical in weight and wording: consent obtained through a weakened refusal is invalid, and that would void the acceptances too.
