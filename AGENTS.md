# AGENTS.md - Shir Amitai Website

Operational guide for developers and coding agents. It describes the repo as it is; where it and the code disagree, the code wins. Most files carry a header comment explaining *why* they are the way they are - read it before changing them.

---

## 1. Project overview

Static website for **שיר אמיתי**, a holistic therapist (פסיכותרפיה · טיפול במגע · פתיחת קול). Hebrew-only, fully RTL, watercolor-themed, calm scroll choreography. Live at `https://www.shir-amitai.com`.

**Stack:** Astro 4 (static) · MDX · Lenis + GSAP/ScrollTrigger · smol-toml + Zod · astro-icon · sharp (build-time image measurement) · pnpm 9.

**Non-negotiable constraints** (failing any is a regression):
1. **Hebrew-only** copy. The only Latin permitted on rendered surfaces: `mailto:`/`tel:`/`wa.me` hrefs and the visible email/phone strings, `©` + year digits, and the footer builder credit (§7).
2. **RTL-native** - `<html lang="he" dir="rtl">`, logical CSS properties, mirrored directional icons (§4.4).
3. **Fully responsive**, 320 px to ultra-wide, with no horizontal scroll at any width. Fluid `clamp()` type and spacing rather than per-breakpoint overrides; touch targets ≥ 44 px; test at 320 / 375 / 768 / 1280 / 1600.
4. **Static output only** - no backend, no server functions, no runtime APIs, and no third-party origins at all (fonts are self-hosted; there is no analytics, and `terms.toml` says so in writing).
5. **WhatsApp → Phone → Email** ordering everywhere a contact action surfaces (§9).
6. **WCAG 2.1 AA**, including the in-page motion mechanism (§8) and the published accessibility statement (§10).
7. **Targets:** Lighthouse Perf ≥ 95, A11y = 100, SEO = 100. Home JS ≤ 60 KB gz (currently ~53 KB, nearly all GSAP + Lenis).

---

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
├── lib/           # content.ts (TOML loader), seo.ts, blog.ts, recommendations.ts, screenshots.ts
├── pages/         # index, about, contact, 404, recommendations, accessibility, terms,
│                  #   psychotherapy, shiatsu, voice, blog/index, blog/[slug]
└── scripts/       # lenis-init.ts, scroll-reveal.ts, parallax.ts, home-scroll.ts
public/
├── global.css     # THE stylesheet - see §4.1
├── fonts/         # self-hosted Heebo (hebrew + latin subsets)
└── img/           # bg/ · content/ · recommendations/ · og-default.jpg
```

Root: `astro.config.mjs`, `tsconfig.json` (`@/*` → `src/*`), `package.json`, `pnpm-lock.yaml` (committed), `.nvmrc`.

Not part of the build:
- `editor-guide/` - a standalone Hebrew HTML guide teaching Shir to edit content through the GitHub web editor. **Update it whenever you change the shape of something an owner edits** (TOML keys, frontmatter fields, folder layout).
- `log/` - the original design spec and brief, kept as a historical record of intent. Useful background, not a description of the current code.
- `coming-soon-page/` - the retired placeholder landing page.

---

## 3. Getting started

Node ≥ 20 (`.nvmrc`), pnpm 9 (pinned via `packageManager`). No `.env` - the site has no secrets.

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # → dist/
pnpm preview    # serve dist/ locally
pnpm check      # astro check (types + content schemas)
```

`pnpm check` and `pnpm build` must both pass, clean, before any change is done.

---

## 4. Design system

### 4.1 Where CSS lives - read before touching any style

**`public/global.css` is the site's stylesheet.** `BaseLayout` links it as a plain static asset, so it is served verbatim: not bundled, not minified, not processed by Vite. No `@import`, no PostCSS, no compiler-dependent nesting. It holds, in order: `@font-face` → **design tokens** → **themes** → reset → typography → RTL → utilities → styles for `GlassCard`, `SectionHeading`, `SoftImage`, `CTAButton`, `ContactPill` → **the accessibility block, which must stay last** (it wins by source order instead of `!important` on every rule).

Everything else lives in scoped `<style>` blocks inside the `.astro` component that owns it - those *are* bundled normally.

### 4.2 Tokens & theming

All visual constants are CSS variables in the token block of `global.css`: colors, font scale, spacing, radii, motion, breakpoints. **Never hardcode** a color, size, duration or easing in a component - add a token, then reference it.

Modality accents are registered in the themes block as `[data-theme="…"]` and selected via `data-theme` on `<body>` (via `BaseLayout`'s `theme` prop) or on a `<section>`. Theme-sensitive styles read `var(--accent)` / `var(--accent-soft)` - never a hardcoded color. Adding a modality means adding a `[data-theme]` row there.

### 4.3 Typography

Two roles, one webfont. `--font-display` is **Heebo**, the only downloaded face, self-hosted as a variable font in `public/fonts/`; it carries wordmarks, titles, kickers and blockquotes. `--font-sans` is the visitor's own system UI font and carries body and UI text - deliberately not a webfont. Do not introduce Google Fonts or any other external origin. Always reference a family through its token.

**No italic Hebrew** - emphasis comes from weight, font switch, size and letter-spacing. Sizes via `clamp()` from the token scale. Western digits only.

### 4.4 RTL - RTL-native, not RTL-patched

- **Logical properties only**: `margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `text-align: start/end`. Never `margin-left/right` or `text-align: left/right`.
- Let `dir="rtl"` flow do its work - don't fight it with `row-reverse`.
- For directional transforms multiply by `--dir-x` (`-1` in RTL) instead of hardcoding a sign; see `.drawer` in `global.css`.
- Mirror directional icons: "next" points left ←, "back" points right →. The mobile drawer slides in from the **right**.
- Rare LTR islands (email/phone strings, builder credit) wrap in `dir="ltr"`.

---

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

---

## 6. Components

UI primitives (`ui/`, `layout/`) are the building blocks; page-level components compose them. **Pages never define visual primitives.** Each component's header comment states its contract - consult it rather than guessing.

Worth knowing without opening the file:

- **SoftImage** is the only sanctioned image renderer. It takes an image **id**, applies the watercolor mask, and sources `alt` from the manifest. It renders a plain `<img>` from `public/` - not `astro:assets` - so there is no automatic AVIF/WebP or `srcset`: optimize and size files *before* committing them.
- **CTAButton** variants map to the §9 priority: `primary` = WhatsApp, `secondary` = phone, `tertiary` = email / read-more.
- **Icon** takes either `label` (→ `role="img"`) or `decorative` (→ `aria-hidden`). New icons: single color, `stroke="currentColor"`, no fills, `stroke-width="1.5"`, rounded caps.
- **ContactPill** and **BackgroundField** are singletons - reuse, don't reimplement.
- **TherapyPage** and **LegalPage** are shared templates; their pages are thin wrappers. Add a page of that kind by adding a wrapper, not a new template.
- **MDX body components** are passed in via `<Content components={{ SoftImage }} />` in `TherapyPage.astro` and `blog/[slug].astro`. To use another component inside body copy, add it to both maps.

---

## 7. Hebrew-only & the builder credit

Page titles, meta, OG/Twitter, JSON-LD strings, `alt`, `aria-label`, buttons and links are all Hebrew. Blog slugs are Hebrew (URL-encoded UTF-8 in the sitemap).

The one intentional English string is the builder credit in `Footer.astro` - hardcoded there rather than in TOML, wrapped in `lang="en" dir="ltr"`, styled subtly. Leave it as it is.

---

## 8. Animation & the motion mechanism

**Lenis** drives inertial scroll (`lenis-init.ts`); **GSAP + ScrollTrigger** handles scrubbed timelines (`home-scroll.ts`) through `ScrollTrigger.scrollerProxy`. Simple reveals use IntersectionObserver (`scroll-reveal.ts`) and parallax is a plain scroll handler (`parallax.ts`) - reach for GSAP only when you need scrub or pin.

View Transitions are deliberately absent; `BaseLayout`'s header comment explains why. Don't reintroduce them without solving that.

**Hard rules:**
- Animate `transform` / `opacity` only - never `top` / `left` / `width` / `height`.
- `will-change` only on currently-animating elements.
- Use motion tokens (`--dur-*`, `--ease-*`) - never raw values.
- Every animation needs a `prefers-reduced-motion: reduce` fallback (≤ 200 ms, opacity-only). Every script above bails out entirely under that query. Test it.

**The in-page mechanism (WCAG SC 2.2.2 / ת"י 5568 חלק 1)** - several animations loop indefinitely, so an OS-level preference alone is not enough. `MotionToggle` sets `data-motion="off"` on `<html>` and persists it; an inline script in `BaseLayout`'s `<head>` restores it before first paint; the `[data-motion="off"]` rules are the last block in `global.css`. **Any new indefinitely-looping animation must be covered by that block** - verify by toggling.

**No-JS safety net:** `[data-reveal]` starts at `opacity: 0` and is revealed by IntersectionObserver, so `<html class="no-js">` keeps it visible when JS is off. Never ship reveal-gated content without that path.

---

## 9. Contact-channel priority

**WhatsApp → Phone → Email**, in HTML source order, tab order, and visual emphasis (`primary` / `secondary` / `tertiary`). Single-action contexts always use WhatsApp; so does the collapsed ContactPill and the first `Person.contactPoint` in JSON-LD.

The details themselves live in `site.toml` `[contact]` and are read from there by `seo.ts` and the layout components. Never restate them in code.

---

## 10. Accessibility, SEO, performance

**Accessibility (WCAG 2.1 AA, Lighthouse = 100):** semantic HTML; one `<h1>` per page and no skipped heading levels; keyboard-reachable controls with visible focus rings; Hebrew `aria-label` on icon-only buttons; meaningful `alt` (or `alt=""` for decorative); contrast ≥ 4.5:1 body, ≥ 3:1 large; skip link; hit targets ≥ 44×44 px; `prefers-reduced-motion` honored; the §8 motion toggle present. Test with keyboard and a Hebrew screen reader.

The site publishes a formal **הצהרת נגישות** at `/accessibility` (required by תקנה 35), which must describe the site as it actually is: **any change affecting accessibility requires updating `src/content/pages/accessibility.toml`, including its `updated` date.** The same applies to `terms.toml` if a third-party script is ever added - its "no analytics" claim would become false.

**SEO:** unique Hebrew `<title>` ≤ 60 chars (`BaseLayout` appends `" | שיר אמיתי"`), 140-160-char description, canonical, OG + Twitter with `og:locale="he_IL"`, `hreflang="he"`. JSON-LD comes from `src/lib/seo.ts`: `Person` + `HealthAndBeautyBusiness` on home, `Service` on therapy pages, `BlogPosting` on posts. `sitemap.xml` is generated by `@astrojs/sitemap`.

**Performance budget (home, gzipped):** HTML + critical CSS ≤ 30 KB · JS ≤ 60 KB · LCP image ≤ 120 KB · above-the-fold ≤ 250 KB. Run `pnpm build && pnpm preview` + Lighthouse before finishing any change to home or a shared layout.

---

## 11. Stop and ask

Hardcoding a color, size or contact detail · adding another animation library · adding English copy · adding analytics or any third-party origin · switching structured content away from TOML · adding server-side anything · switching off pnpm · adding a contact form · adding i18n or an English version · reintroducing View Transitions.

---

## 12. References

- `editor-guide/index.html` - the Hebrew guide Shir uses to edit content without touching code.
- `log/plan.md` - the original design specification and rationale (historical).
- Astro https://docs.astro.build · GSAP https://gsap.com/docs/v3/ · Lenis https://github.com/darkroomengineering/lenis
