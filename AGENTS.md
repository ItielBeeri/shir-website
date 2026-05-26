# AGENTS.md — Shir Amitai Website

Operational guide for developers and coding agents. The full design spec lives in **`plan.md`** — when in doubt, follow it.

---

## 1. Project overview

Static website for **שיר אמיתי**, a holistic therapist (פסיכותרפיה גופנית · שיאצו · פתיחת קול). Hebrew-only, fully RTL, watercolor-themed, calm scroll choreography.

**Stack:** Astro (static) · Lenis + GSAP/ScrollTrigger · smol-toml + Zod · astro-icon · pnpm · Cloudflare Pages (or Vercel).

**Non-negotiable constraints** (failing any is a regression):
1. **Hebrew-only** copy. Only Latin permitted on rendered surfaces: `mailto:` / `tel:` / `wa.me` hrefs, `©` + year digits, and the footer builder credit `Built by Itiel Beeri` (§7.2).
2. **RTL-native** — `<html lang="he" dir="rtl">`, logical CSS properties, mirrored directional icons.
3. **Static output only** — no backend, no server functions, no runtime APIs.
4. **WhatsApp → Phone → Email** ordering everywhere a contact action surfaces (§9).
5. **WCAG 2.1 AA**; honor `prefers-reduced-motion`.
6. **Lighthouse** Perf ≥ 95, A11y = 100, SEO = 100. Home JS ≤ 60 KB gz.

---

## 2. Repository structure

```
src/
├── components/
│   ├── layout/      # BaseLayout, Header, Footer, ContactPill, BackgroundField
│   ├── ui/          # GlassCard, SoftImage, SectionHeading, ScrollReveal,
│   │                #   ParallaxLayer, BreathDivider, CTAButton, Icon
│   ├── home/        # Hero, IntroBlock, TherapyTeaser, BlogTeaser
│   └── therapy/     # TherapyPage (shared template for all modalities)
├── icons/           # individual optimized SVGs
├── content/
│   ├── config.ts    # Zod schemas
│   ├── site.toml · nav.toml · images.toml
│   ├── pages/       # home.toml, about.toml, contact.toml, 404.toml
│   ├── therapies/   # *.md (TOML frontmatter)
│   └── blog/        # *.mdx (TOML frontmatter, +++ delimiters)
├── lib/             # content.ts (TOML loader), seo.ts
├── pages/           # index, about, contact, 404, _design, psychotherapy,
│                    #   shiatsu, voice, blog/[slug]
├── scripts/         # lenis-init.ts, scroll-reveal.ts, parallax.ts
└── styles/          # tokens.css, themes.css, base.css, typography.css,
                     #   rtl.css, utilities.css
public/img/          # bg/ (atmosphere) · content/ · decor/
```

Root: `astro.config.mjs`, `package.json`, `pnpm-lock.yaml` (committed), `.nvmrc`, `AUTHORING.md`, `AGENTS.md`, `plan.md`.

---

## 3. Getting started

**Prereqs:** Node ≥ 20 (see `.nvmrc`), pnpm ≥ 9 (pinned via `packageManager` in `package.json`). No `.env` needed — the site has no secrets.

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # → dist/
pnpm preview    # serve dist/ locally
pnpm check      # astro check (types + content schemas)
```

`pnpm check` and `pnpm build` **must** pass before opening a PR.

---

## 4. Design system

### 4.1 Tokens (single source of truth)
All visual constants are CSS variables in **`src/styles/tokens.css`**: colors, modality accents, font scale (`--fs-*`), spacing, radii, motion (`--ease-*`, `--dur-*`). **Never hardcode** colors/sizes/durations/easings in components — add a token, then reference it.

### 4.2 Theming
Modality accents declared in **`src/styles/themes.css`** and selected via `data-theme` on `<body>` or a `<section>`:

```css
[data-theme="default"]       { --accent: var(--color-cream);    --accent-soft: var(--color-paper); }
[data-theme="psychotherapy"] { --accent: var(--color-lavender); --accent-soft: #e5dcf0; }
[data-theme="shiatsu"]       { --accent: var(--color-teal);     --accent-soft: var(--color-seafoam); }
[data-theme="voice"]         { --accent: var(--color-rose);     --accent-soft: var(--color-sand); }
```

Theme-sensitive styles must read `var(--accent)` — never a hardcoded color.

### 4.3 Typography
Two Hebrew fonts only: **Assistant** (sans, primary) and **Frank Ruhl Libre** (serif, accent), loaded with `subset=hebrew`. **No italic Hebrew** — emphasis comes from weight (300↔600), font switch, size, letter-spacing. Sizes via `clamp()` from the token scale. Western digits only.

### 4.4 RTL — code must be RTL-native, not RTL-patched
- Use **logical properties**: `margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `text-align: start/end`, `float: inline-start/end`. **Never** `margin-left/right`, `text-align: left/right`.
- Let `dir="rtl"` flow do its work — don't fight it with `row-reverse`.
- Mirror directional icons: "next" points left ←, "back" points right →.
- Mobile drawer slides in from the **right**; reveal animations start from the **inline-start** edge.
- Rare LTR islands (English URLs, builder credit) wrap in `<span lang="en" dir="ltr">…</span>`.

---

## 5. Content & data layer

Editable content lives in `src/content/` and is parsed at build time. **Components are dumb renderers** — they accept props and never embed Hebrew copy.

- **TOML** for everything except long-form prose (parsed by `smol-toml`).
- **Markdown/MDX** with **TOML frontmatter** (`+++ … +++` delimiters) for therapy pages and blog posts.
- All entries validated by Zod schemas in `src/content/config.ts` — schema mismatch fails the build with a clear error.
- **Astro Content Collections** for `therapies` and `blog`; standalone TOML files (`site.toml`, `nav.toml`, `images.toml`, `pages/*.toml`) loaded via `src/lib/content.ts` → `loadToml('path', schema)`.
- **Image manifest** (`images.toml`): every image registered with stable id, file path, Hebrew alt. Components receive an id and render via `SoftImage` — never a raw path. `SoftImage` requires alt (sourced from manifest).

---

## 6. Components

UI primitives (`src/components/ui/`, `layout/`) are building blocks. Page-level components compose them. **Pages never define visual primitives.**

| Component | Purpose |
|---|---|
| **GlassCard** | Frosted-glass panel for any text/content block. |
| **SoftImage** | The only sanctioned image renderer; applies watercolor mask. Takes an image id. |
| **SectionHeading** | Kicker + title + animated underline; use for every major section. |
| **ScrollReveal** | Default fade + translate on enter. |
| **ParallaxLayer** | Differential scroll speed. |
| **BreathDivider** | Animated SVG wave between sections (use sparingly). |
| **CTAButton** | Variants: `primary` (WhatsApp), `secondary` (phone), `tertiary` (email / read-more). |
| **Icon** | Sprite-backed inline SVG. |
| **ContactPill** | Persistent floating CTA — reuse, don't reimplement. |
| **BackgroundField** | The watercolor layer; instantiated once in `BaseLayout`. |

**Component contract:** props in, no direct content-collection reads (except well-defined page-level wrappers like `TherapyTeaser`), no Hebrew strings except overridable defaults, full focus/keyboard/ARIA support.

---

## 7. Hebrew-only & builder-credit rules

### 7.1 Hebrew everywhere
Page titles, meta, OG/Twitter, JSON-LD strings, `alt`, `aria-label`, buttons, links — all Hebrew. Allowed Latin on rendered surfaces: `mailto:` / `tel:` / `wa.me` hrefs and visible phone digits; `©` + year digits; the builder credit below. Blog slugs are Hebrew (URL-encoded UTF-8).

### 7.2 Builder credit (the one fixed English string)
Hardcoded in `Footer.astro` (not in TOML):

```html
<span class="builder-credit" lang="en" dir="ltr">
  Built by <a href="https://www.linkedin.com/in/itiel"
              target="_blank" rel="noopener author"
              aria-label="Built by Itiel Beeri — opens LinkedIn profile in new tab"
  >Itiel Beeri</a>
</span>
```

Styled subtly: `--fs-small`, `--color-mist`, decoration only on hover.

---

## 8. Animation

Two engines: **Lenis** for inertial scroll (configured once in `src/scripts/lenis-init.ts`), **GSAP + ScrollTrigger** for pinned/scrubbed timelines and drawn-on-scroll SVGs (integrated via `ScrollTrigger.scrollerProxy`). Simple reveals use **IntersectionObserver** (no library) — reach for GSAP only when you need scrub or pin.

**Hard rules:**
- Every animation has a `prefers-reduced-motion: reduce` fallback (≤ 200 ms opacity-only). Test it.
- No autoplay > 5 s without a pause affordance.
- Animate `transform` / `opacity` only — never `top` / `left` / `width` / `height`.
- `will-change` only on currently-animating elements.

Use motion tokens (`--dur-base` 600 ms, `--ease-soft`) — never raw values.

---

## 9. Contact-channel priority (site-wide)

Order is **WhatsApp → Phone → Email** in:
- HTML source order in any contact group.
- Tab order.
- Visual emphasis: WhatsApp `primary`, phone `secondary`, email `tertiary`.
- Single-action contexts: always WhatsApp.
- ContactPill collapsed icon: WhatsApp.
- JSON-LD `Person.contactPoint`: WhatsApp first.

Canonical details:
- WhatsApp `https://wa.me/972525201162`
- Phone `tel:+972525201162` (display: `052-520-1162`)
- Email `mailto:shir.amitai1@gmail.com`

---

## 10. Accessibility, SEO, performance

**Accessibility (WCAG 2.1 AA, Lighthouse = 100):** semantic HTML; one `<h1>` per page; keyboard-reachable controls with visible focus rings (2 px solid `--color-ink`, 3 px offset); Hebrew `aria-label` on icon-only buttons; meaningful `alt` (or `alt=""` for decorative); contrast ≥ 4.5:1 body, ≥ 3:1 large; skip link `דלג לתוכן`; hit targets ≥ 44×44 px (48×48 on ContactPill); `prefers-reduced-motion` respected. Test with keyboard + NVDA Hebrew voice / VoiceOver.

**SEO:** unique Hebrew `<title>` (≤ 60 chars, " | שיר אמיתי" suffix), 140–160-char meta description, canonical, OG + Twitter with `og:locale="he_IL"`. JSON-LD: `Person` sitewide, `Service` per therapy, `LocalBusiness`/`HealthAndBeautyBusiness` on home, `Blog` + `BlogPosting`. `sitemap.xml` via `@astrojs/sitemap` (excludes `_design`). Use Astro `<Image />` (AVIF/WebP, explicit dims).

**Performance budget (home, gzipped):** HTML + critical CSS ≤ 30 KB · JS ≤ 60 KB (Lenis ~3, GSAP core ~25, ScrollTrigger ~10, app) · LCP image ≤ 120 KB AVIF · above-the-fold ≤ 250 KB. Run `pnpm build && pnpm preview` + Lighthouse before any PR touching home or shared layout.

---

## 11. The `/_design` route

Hidden page rendering every shared component in every state — the project's Storybook-equivalent. `noindex`; excluded from `sitemap.xml` and `robots.txt`. **Adding or modifying a component / variant / icon / theme requires updating `_design.astro` in the same PR.**

---

## 12. Recipes (replaces the planned `RECIPES.md`)

Find the right file, edit the smallest possible surface, commit. Cloudflare Pages rebuilds in ~60 s.

- **A. Edit existing copy** — find the relevant `src/content/**.toml`, edit text between quotes (or `"""…"""`), don't touch keys or `[section]` headers.
- **B. New blog post** — duplicate `src/content/blog/_example.mdx` to `<hebrew-slug>.mdx`; fill `+++` TOML frontmatter (`title`, `excerpt`, `date`, `cover` image id, `tags`, optional `relatedTherapy`); write body; reference images with `<SoftImage>`, never raw `![]`; set `draft = false`.
- **C. New therapy/modality** — add a row to `themes.css`; create `src/content/therapies/<slug>.md` (set `accent`); add a 3-line `src/pages/<slug>.astro` wrapper that loads the entry and renders `<TherapyPage entry={…} />`; add a `nav.toml` entry. The home triptych picks it up automatically.
- **D. New image** — drop file in `public/img/{content,bg,decor}/`; register in `images.toml` with id, `file`, Hebrew `alt`; reference by id.
- **E. Swap an atmosphere image** — regenerate from a `plan.md §7` prompt; replace the file (keep filename) or update `images.toml`. No code change.
- **F. Tweak the palette globally** — edit `src/styles/tokens.css` only; verify on `/_design`.
- **G. Testimonials section** — add `src/content/testimonials.toml` + Zod schema; build `<TestimonialsSection>` from `SectionHeading` + grid of `GlassCard`s (quote icon, Frank Ruhl Libre 300 quote, name).
- **H. FAQ accordion on a therapy page** — add `faq` array to therapy frontmatter; render as `<details><summary>` styled like GlassCards; use `interpolate-size: allow-keywords` with reduced-motion fallback.
- **I. Events/workshops collection** — define collection in `config.ts` mirroring `blog` (+ `date`, `location`); add `pages/events/{index,[slug]}.astro`; nav entry.
- **J. New top-level page** (e.g., Press) — add `src/content/pages/press.toml`; copy `pages/about.astro` as the template, rewire to load `press.toml`; nav entry.
- **K. New CTA variant** — extend `CTAButton.astro` `variant` prop; style with existing tokens; add a row to `/_design`.
- **L. New icon** — drop optimized SVG into `src/icons/` (single color, `stroke="currentColor"`, no fills, `stroke-width="1.5"`, rounded caps); use `<Icon name="…" label="תיאור" />` or `decorative`; add to `/_design`.

---

## 13. PR workflow

1. Read the relevant `plan.md` section for the area you're touching.
2. Skim `/_design`.
3. Prefer extending tokens / themes / components over new primitives.
4. Touch the smallest surface (a copy edit = one TOML line).
5. Update `/_design` if you added/changed a visual primitive.
6. Run `pnpm check` and `pnpm build`.
7. Verify RTL (temporarily flip to `dir="ltr"` to confirm mirroring is intentional, then revert).
8. Verify reduced-motion via the OS setting.
9. Re-run Lighthouse on any visually/structurally changed page.
10. Reference the recipe (§12) or `plan.md` section in the PR description.

### Stop-and-ask triggers
Hardcoding a color/size/string · adding another animation library · adding English copy · adding analytics · changing TOML to YAML/JSON · adding server-side anything · changing pnpm to npm/yarn · adding a contact form · adding i18n / English version.

---

## 14. Deployment

Push to `main` → Cloudflare Pages (or Vercel) auto-deploys. `pnpm-lock.yaml` is committed and `packageManager` is pinned. If Cloudflare doesn't auto-detect pnpm, set `PACKAGE_MANAGER=pnpm` in the project env.

---

## 15. References

- **`plan.md`** — full design specification, atmosphere image prompts, rationale.
- **`AUTHORING.md`** — Hebrew guide for Shir (owner) to edit content without touching code.
- **`/_design`** (local) — live visual reference for every component.
- Astro https://docs.astro.build · GSAP https://gsap.com/docs/v3/ · Lenis https://github.com/darkroomengineering/lenis
