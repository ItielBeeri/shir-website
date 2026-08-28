# Shir Amitai — Website Build Plan

A comprehensive plan for building Shir Amitai's holistic therapy website. This document focuses on **structure**, **visual design**, **interaction/scrolling experience**, and **technical architecture**. Textual content and final portrait/illustration images are intentionally left as placeholders — they will be filled later.

---

## 0. Language & Direction — Hebrew-only, fully RTL

**This is an absolute constraint that governs every other decision in this document.**

- The site is **Hebrew-only**. No English copy, no bilingual content, no English subtitles, taglines, kickers, or labels. The only Latin characters that may appear anywhere on the rendered site are:
  - Email addresses in `mailto:` links (the address string itself).
  - The international phone number digits.
  - Social URL fragments inside `href` attributes (never visible to the user).
  - The optional small "© 2026" character in the footer (digits + © symbol are universal).
  - **One explicit exception**: the four-word builder credit "Built by Itiel Beeri" in the footer's bottom bar — see §5.3.1. This is the single intentional English string on the site, scoped to a developer signature and wrapped in `<span lang="en" dir="ltr">`.
- The `<html>` element on every page declares `lang="he"` and `dir="rtl"`. No exceptions.
- All page titles, meta descriptions, OG tags, JSON-LD strings, alt text, ARIA labels, button labels, error messages, the 404 page, the accessibility statement, image filenames where user-visible, and the sitemap entries' text are **in Hebrew**.
- All layouts are **RTL-native**: logical CSS properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-end`, etc.) are used throughout — never `margin-left` / `right`. Flex/grid use logical direction (default flow is right→left).
- Iconography that has a directional sense (arrows in "read more →", prev/next chevrons, drawer slide direction) is **mirrored**: the "forward" arrow points **left** (←), "previous" points **right** (→). The mobile drawer slides in from the **right** edge.
- Typography uses **two Hebrew fonts** (see §2.2) to achieve the dual-voice feel the placeholder page had — the previously-used `Cormorant Garamond` (a Latin-only font) is **removed entirely** and replaced with `Frank Ruhl Libre`, a classical Hebrew serif. The accent/italic role is now played by Hebrew italics + the serif font, not by Latin script.
- The brand wordmark is **"שיר אמיתי"** only. The Latin transliteration "Shir Amitai" used on the current placeholder page is **dropped** from all rendered surfaces.
- The favicon SVG is unchanged (it is a wave glyph, language-neutral).
- All form/UI strings, validation messages, scroll cues ("גלילה"), nav items, dropdown labels, blog post meta ("דקות קריאה", "פורסם ב…"), share-button tooltips, and `aria-label`s are written in Hebrew.
- This Hebrew-only constraint **overrides any earlier mention** in this document of Latin accents, English kickers, Cormorant italics, or bilingual content. Where this document later still implies dual-language usage, treat the Hebrew side as the only side.

---

## 1. Vision & Design Philosophy

### 1.1 Atmosphere — "Breath, Touch, Voice"
The site should feel like a slow, deep inhale. Visitors land into a soft watercolor world that gently breathes — never static, never busy. The dominant feelings are:

- **Spaciousness** — generous whitespace, no UI clutter, no sharp edges.
- **Softness** — watercolor washes, blurred glass surfaces, type with low contrast and air.
- **Movement** — every element drifts slightly. Nothing is locked. Nothing snaps.
- **Tension between calm and aliveness** — cool teals/lavenders ground; warm sand/peach awaken.
- **Holism** — three modalities (body / touch / voice) feel like one single language.

### 1.2 Visual references (loose, not strict)
- Existing `background.jpg` — the *master* color and texture reference.
- `idogilat.com` — page-as-poetry, generous type, low UI density.
- `daoism.co.il` — calm Hebrew typography, slow rhythm.
- `viens-la.com` — section-to-section reveals, sticky media, soft inertia.
- `aristidebenoist.com` — cursor presence, slow scroll parallax, full-bleed transitions.
- `koto.com` — page transitions as curtains/washes, scroll-bound media.

### 1.2.1 What we actually took from the two atmosphere references
After examining `idogilat.com` and `daoism.co.il` directly: both are conventional CMS sites (Wix and WordPress/Elementor respectively) with no notable motion or scroll choreography. Our scroll/transition ambition is intentionally **well beyond** them — it draws from the second group of references (viens-la, aristidebenoist, koto). From the Hebrew therapy references we adopt only the **tone and atmospheric devices**:

- **Spare Hebrew text, generous whitespace**, calm pacing — confirmed direction.
- **A persistent floating contact button** in the corner (daoism uses WhatsApp; our `ContactPill` already covers this — keep it).
- **A short, literary closing element** — daoism ends with a classical Daoist quote in original script + Hebrew translation. We adopt a Hebrew-only variant: an optional, very subtle "closing breath" element above the footer on long pages — a single Hebrew line set in Frank Ruhl Libre 300 at ~70% opacity, with a watercolor brush stroke beneath. **No foreign-script original**; if Shir wishes to quote a non-Hebrew source, only the Hebrew translation appears, with attribution in Hebrew. Content TBD by Shir.
- **Photography mood**: idogilat uses warm, slightly desaturated documentary-style portraits. We'll request the same mood when collecting Shir's photos (added as guidance to the content-placeholder inventory).
- **Image credits page** (daoism has one) — only relevant if we end up using any third-party imagery. If all content imagery is original or AI-generated atmosphere, we don't need it. Keep as a deferred decision.
- **Hebrew accessibility toolbar** — many Israeli sites include a third-party widget (e.g., `nagich.co.il`, `userway`). It is **not legally mandatory** for personal/professional practice sites, and adding a third-party widget would conflict with our perf and accessibility-by-design goals (those widgets are often non-compliant themselves). We will instead build accessibility natively (§10) and link to a written accessibility statement in the footer, which is the more modern, conformant approach. This is a deliberate divergence from the reference.

### 1.3 Core design principles
1. **The watercolor never leaves you.** A washed background layer is always present (fixed position), never scrolls away. It is the "field" all content floats inside.
2. **Type breathes.** Generous line-height (1.7+), extreme weight contrast (100↔700), airy spacing.
3. **Open, not contained.** Content floats directly on the watercolor — no enclosing cards or boxes for text. Images use a soft watercolor mask. The design language is editorial and spacious, not "card-based."
4. **Slow.** Default transition duration is `700–1200ms` with `cubic-bezier(0.22, 1, 0.36, 1)` ("ease-out-expo"). Nothing snaps.
5. **Hebrew-only, RTL-native.** All layouts mirror correctly (logical CSS properties). No Latin accent script. Visual hierarchy is achieved via weight contrast within a single font family (Heebo).

---

## 2. Design Tokens

### 2.1 Color palette
Extracted from the background image and the owner's brief.

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#22332a` | Primary text (deep forest) |
| `--color-ink-soft` | `#4a5c51` | Secondary text |
| `--color-mist` | `#7a8a82` | Tertiary text, captions |
| `--color-paper` | `#fdfaf4` | Off-white canvas / card highlight |
| `--color-cream` | `#f5ecda` | Warm neutral surface |
| `--color-sand` | `#e8d4a8` | Awakening accent |
| `--color-peach` | `#f3c9bb` | Warm touch accent |
| `--color-rose` | `#e9b8c2` | Voice accent (warmth) |
| `--color-lavender` | `#c9bde0` | Psyche accent (depth) |
| `--color-teal` | `#a6d4c8` | Body accent (calm) |
| `--color-seafoam` | `#bfe0d3` | Background tone |
| `--color-glass` | `rgba(255,255,255,0.42)` | Frosted card surface |
| `--color-glass-stroke` | `rgba(255,255,255,0.55)` | Card border |
| `--shadow-soft` | `0 15px 40px rgba(92,110,101,0.06)` | Card lift |

Each of the three modalities has its own accent color:
- **Physical psychotherapy (speech)** → `--color-lavender` (depth, psyche)
- **Shiatsu / touch** → `--color-teal` (body, ground)
- **Voice opening** → `--color-rose` + `--color-sand` (warmth, awakening)

### 2.2 Typography

The site is Hebrew-only. We use **one Hebrew typeface** — a modern sans-serif with an exceptionally wide weight range — to achieve visual hierarchy through weight contrast alone.

- **Primary (all uses)**: `Heebo` — weights 100, 200, 300, 400, 500, 700. A clean, modern Hebrew sans-serif with excellent readability at all sizes. The ultra-thin weight (100) creates striking display text; 300–400 serves body; 500–700 for emphasis. Already optimized for screen rendering.
- **Fallback chain**: `'Heebo', 'Arial Hebrew', system-ui, sans-serif`.

**Design contrast is achieved via weight, not font-family switching:**
- Display/titles: weight 100–200 (ultra-thin, elegant, airy)
- Kickers/labels: weight 300, small size, letter-spacing
- Body: weight 400
- Emphasis/buttons: weight 500–700

Italics are avoided — Hebrew has no native italic form. Emphasis is achieved via **weight contrast** (100 ↔ 700), **size**, and **letter-spacing**, never via skew or oblique transforms.

Scale (fluid, `clamp()`, identical to before):
```
--fs-display   : clamp(2.6rem, 6vw + 0.5rem, 5.5rem);   /* hero titles */
--fs-h1        : clamp(2rem,   3.5vw + 0.5rem, 3.5rem);
--fs-h2        : clamp(1.5rem, 2vw + 0.5rem, 2.25rem);
--fs-h3        : clamp(1.2rem, 1vw + 0.7rem, 1.5rem);
--fs-body      : clamp(1.05rem, 0.3vw + 1rem, 1.18rem);
--fs-small     : 0.92rem;
--lh-body      : 1.75;
--lh-display   : 1.2;     /* slightly looser than before; Hebrew display needs more breathing room */
--ls-display   : 0.04em;  /* slightly tighter than Latin equivalent; Hebrew has wider intrinsic spacing */
--ls-caps      : 0.12em;  /* Hebrew doesn't have real small-caps; reserve this for the rare Latin in URLs */
```

Font loading: Heebo loaded via `<link rel="preconnect">` to `fonts.gstatic.com` and a single `<link rel="stylesheet">` request with `display=swap`. Hebrew-only subset requested (`subset=hebrew`) to keep payload tiny — ~20-30 KB.

### 2.3 Spacing & rhythm
8px base grid. Sections use vertical rhythm based on viewport height for poetic pacing:
```
--space-section: clamp(6rem, 12vh, 12rem);
--space-block  : clamp(2rem, 5vh, 4rem);
--radius-card  : 28px;
--radius-pill  : 999px;
--blur-glass   : 18px;
```

### 2.4 Motion tokens
```
--ease-soft    : cubic-bezier(0.22, 1, 0.36, 1);
--ease-breath  : cubic-bezier(0.45, 0, 0.55, 1);
--dur-fast     : 280ms;
--dur-base     : 600ms;
--dur-slow     : 1100ms;
--dur-page     : 900ms;
```

All motion respects `prefers-reduced-motion: reduce` — animations collapse to simple opacity fades ≤ 200ms.

---

## 3. Site Map & Routing

```
/                         Home
/about                    About Shir
/psychotherapy            Physical / verbal psychotherapy
/shiatsu                  Shiatsu-based touch therapy
/voice                    Voice opening & releasing
/blog                     Blog index
/blog/[slug]              Single blog post (slug is Hebrew, URL-encoded)
/contact                  Contact — slim canonical page (one screen)
404                       Themed not-found page (watercolor + helpful links)
```

### 3.0.1 URL design notes
- **Therapy pages are top-level** (no `/therapies/` segment) for shorter, keyword-strong Hebrew URLs and a more direct mental model.
- **Top-level slugs are reserved**: `about`, `psychotherapy`, `shiatsu`, `voice`, `blog`, `contact`. New top-level pages added later must not collide with these or with future modality names. (If a 4th modality is later added, it gets its own top-level slug too.)
- The three therapy URLs are each backed by a thin 3-line page file (`src/pages/psychotherapy.astro` etc.) that imports the shared `TherapyPage.astro` template and passes the corresponding content entry. This keeps URLs clean without a catch-all `[slug].astro` that would clash with other top-level routes.
- **`/contact` is intentionally kept** even though contact options appear in the ContactPill, footer, and home closing section. Reasoning: it provides a canonical URL to share verbally / on business cards / in Google Business listings; it hosts content that doesn't fit elsewhere (clinic location, session logistics — פרדס חנה / זום); it serves as the landing page for `LocalBusiness` JSON-LD, which Google prefers on a dedicated page. The page is deliberately slim (~one screen tall).
- **`/404` is kept as a real themed page**, not a redirect to `/`. Redirecting unmatched URLs to home produces "soft 404s" which Google penalizes, and silently teleporting users is disorienting. Cloudflare Pages auto-serves the built `404.html` for any unmatched route — no config needed.

### 3.1 Inter-linking matrix
Every page links to:
- **Logo → Home** (always, in header)
- **Footer links** to: Home, About, all 3 Therapies, Blog, Contact
- **Persistent floating contact pill** (WhatsApp / phone / email — in that priority order, see §5.4) — bottom-corner, all pages

Page-specific cross-links:
- **Home** → all 5 destination pages (one teaser block each)
- **About** → CTA cards to all 3 Therapies + Blog
- **Each Therapy page** → links to the *other two* therapy pages at the bottom ("Explore other paths") + Contact CTA + 1–2 related blog posts (if exist)
- **Blog index** → article tiles → single post
- **Single post** → previous/next post, back to Blog index, related therapy page, Contact CTA
- **404** → Home, Contact

---

## 4. Technical Architecture

### 4.1 Stack decision

**Recommendation: Astro + minimal client islands.**

Reasoning:
- The hard requirement is *stunning UX with seamless page transitions* — but the content is mostly static and SEO-critical (Hebrew clinic site).
- A full SPA (Next/Nuxt SSR-only) is overkill and hurts initial paint.
- A pure static multi-page site struggles with smooth page transitions.
- **Astro** gives us: static HTML output (perfect SEO, near-zero JS by default), file-based routing, MDX for blog posts, partial hydration for interactive bits, and **native `<ViewTransition />` support** for smooth cross-page morphs (with a JS fallback via the View Transitions API polyfill behavior). It builds on Cloudflare Pages / Vercel / Netlify free tiers out of the box.
- License: MIT.

Client islands (only where needed):
- Scroll-driven animations controller (`Lenis` for smooth scroll + `GSAP` ScrollTrigger, **or** lightweight: `motion.dev` (Motion One, MIT) — see §4.2).
- Mobile nav drawer.
- Blog filter/tag chips (if added later).

### 4.2 Animation libraries
**Primary stack:**
- **Lenis** (`@studio-freight/lenis`, MIT, ~3 KB) — smooth, inertial scroll. This is the exact library used by the high-end scroll-experience sites in the brief (e.g., viens-la.com). Healthy community, ~10k GitHub stars, very active.
- **GSAP 3 + ScrollTrigger** (~35 KB gzipped combined). As of **mid-2024, after Webflow's acquisition, GSAP is 100% free for everyone, including commercial use, including all former "Club" plugins** (ScrollTrigger, ScrollSmoother, SplitText, MorphSVG, etc.). It is the de-facto industry standard for the genre of scroll-bound, choreographed motion that this site requires; the reference inspiration sites (Aristide Benoist, Koto, viens-la) all rely on it. Community: ~20k stars, ~15-year track record, huge ecosystem of demos and tutorials.
- **Lenis ↔ GSAP integration**: a documented pattern — Lenis emits a tick that drives ScrollTrigger's `update()`. Two-file boilerplate.

**Why not Motion One?** Lighter (~6 KB) and modern, but its scroll-trigger ergonomics (pinning, scrubbed timelines, complex stagger choreography) are noticeably weaker than ScrollTrigger's. For this brief's level of motion ambition, GSAP is the correct trade-off; the ~30 KB extra is acceptable inside our perf budget.

**View transitions** between pages handled by Astro's built-in `<ClientRouter />` (formerly `<ViewTransitions />`), which uses the browser's native View Transitions API and degrades to a simple cross-fade on Firefox/Safari versions lacking support.

### 4.3 Hosting & build
- Repository → Cloudflare Pages (preferred) or Vercel.
- **Package manager: pnpm** (see §4.3.1 below).
- Build: `pnpm build` → `dist/` static output.
- No backend. Contact "form" is replaced by direct contact links — ordered **WhatsApp (`wa.me`) → phone (`tel:`) → email (`mailto:`)** per §5.4 (per spec).
- Images: served from `/public/img/`, generated with Astro's `<Image />` for automatic AVIF/WebP + responsive `srcset`.

### 4.3.1 Package manager — pnpm

We use **pnpm** rather than npm for faster installs (~2-3×), lower disk usage (~50% — relevant for CI cold builds and Cloudflare's build-minute budget), and stricter dependency hygiene. Both target hosts support it natively:

- **Vercel** — auto-detects pnpm from the presence of `pnpm-lock.yaml` and runs `pnpm install` + `pnpm build`. No configuration required.
- **Cloudflare Pages** — auto-detects pnpm from the lockfile on current (Wrangler-based) builds. If a stale project doesn't auto-detect, set the env var `PACKAGE_MANAGER=pnpm` in the Pages project settings.

Requirements to honor in the repo:
- `pnpm-lock.yaml` must be committed to git.
- `package.json` declares the toolchain so hosts and contributors agree on versions:
  ```json
  {
    "packageManager": "pnpm@9.x.x",
    "engines": { "node": ">=20.0.0" }
  }
  ```
- A `.nvmrc` (or `.node-version`) file at the repo root pins the Node version for local dev parity with the hosts.
- If a transitive package has a sloppy peer-dependency declaration that pnpm warns on, suppress via:
  ```json
  "pnpm": { "peerDependencyRules": { "ignoreMissing": ["..."] } }
  ```
  Not anticipated for our stack (Astro, Lenis, GSAP, smol-toml, astro-icon, Zod) but documented as the escape hatch.

No other code or config changes are required to use pnpm — every script in `package.json` runs identically (`pnpm dev`, `pnpm build`, `pnpm preview`).

### 4.4 Project structure
```
shir-website/
├── public/
│   ├── img/
│   │   ├── bg/                 # generated atmosphere images
│   │   ├── content/            # to-be-filled portraits/illustrations
│   │   └── decor/              # leaves, brush strokes, dividers
│   ├── fonts/                  # optional self-hosted fallback
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BaseLayout.astro
│   │   │   ├── Header.astro
│   │   │   ├── Footer.astro
│   │   │   ├── ContactPill.astro
│   │   │   └── BackgroundField.astro      # the parallax watercolor layer
│   │   ├── ui/
│   │   │   ├── GlassCard.astro
│   │   │   ├── SoftImage.astro            # image with watercolor mask
│   │   │   ├── SectionHeading.astro
│   │   │   ├── ScrollReveal.astro
│   │   │   ├── ParallaxLayer.astro
│   │   │   ├── BreathDivider.astro        # animated SVG wave
│   │   │   ├── CTAButton.astro
│   │   │   └── Icon.astro                  # sprite-backed icon (see §12.7.2)
│   │   ├── home/
│   │   │   ├── Hero.astro
│   │   │   ├── IntroBlock.astro
│   │   │   ├── TherapyTeaser.astro
│   │   │   └── BlogTeaser.astro
│   │   └── therapy/
│   │       └── TherapyPage.astro          # shared template used by all three therapy pages
│   ├── icons/                  # individual SVGs, bundled into the Icon component
│   │   ├── phone.svg
│   │   ├── whatsapp.svg
│   │   ├── mail.svg
│   │   └── …
│   ├── content/                # All editable content — see §12.6
│   │   ├── config.ts           # Zod schemas for all collections
│   │   ├── site.toml           # global: brand, contact, social, footer
│   │   ├── nav.toml            # nav structure
│   │   ├── images.toml         # central image manifest (id → file + alt)
│   │   ├── pages/
│   │   │   ├── home.toml
│   │   │   ├── about.toml
│   │   │   ├── contact.toml
│   │   │   └── 404.toml
│   │   ├── therapies/          # one MD per modality
│   │   │   ├── psychotherapy.md
│   │   │   ├── shiatsu.md
│   │   │   └── voice.md
│   │   └── blog/
│   │       ├── _example.mdx
│   │       └── …
│   ├── lib/
│   │   ├── content.ts          # TOML loader + schema validation helper
│   │   └── seo.ts              # SEO/JSON-LD helpers
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── contact.astro
│   │   ├── 404.astro
│   │   ├── _design.astro       # hidden component preview route — see §12.7.3
│   │   ├── psychotherapy.astro # thin wrapper that renders <TherapyPage entry={…} />
│   │   ├── shiatsu.astro       # same wrapper, different content entry
│   │   ├── voice.astro         # same wrapper, different content entry
│   │   └── blog/
│   │       ├── index.astro
│   │       └── [slug].astro
│   ├── scripts/
│   │   ├── lenis-init.ts
│   │   ├── scroll-reveal.ts
│   │   └── parallax.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── themes.css           # theming registry — see §12.7.1
│   │   ├── base.css
│   │   ├── typography.css
│   │   ├── rtl.css                 # RTL-specific overrides & logical-property polyfills if needed
│   │   └── utilities.css
├── astro.config.mjs
├── package.json
├── AUTHORING.md                # Hebrew guide for Shir — see §12.6.6
├── AGENTS.md                   # developer & coding-agent guide (includes recipes — see §12.7.4)
└── plan.md
```

---

## 5. Shared Components & Global Layout

### 5.1 BackgroundField (the soul of the site)
A fixed layer behind all content, present on every page.

- **Layer 1**: the existing `background.jpg` set to `position: fixed`, `object-fit: cover`, with a slight `transform: scale(1.02)` for crop safety. No scroll-based translateY — the background stays fixed and never exposes white gaps.
- **Layer 2**: an SVG noise/grain overlay at ~4% opacity for "paper" feel.
- **Layer 3**: 2–3 soft `radial-gradient` blobs that drift extremely slowly via CSS `@keyframes` (60–90s cycle) — adds living motion even when user is idle.
- **Layer 4 (optional)**: page-specific accent — e.g., a single feathered watercolor leaf SVG in a corner, theme-colored per page.

Each subpage tints the background with a soft theme color overlay (`mix-blend-mode: soft-light` at 10–20% opacity) so transitions between pages feel like a watercolor wash changing tone.

### 5.2 Header
- Sticky, transparent, ~72px tall on desktop, ~56px on mobile.
- Becomes a faint frosted-glass bar on scroll (after 80px) — `backdrop-filter: blur(14px)` + `background: rgba(253,250,244,0.55)`.
- **Start side (right, in RTL)**: Logo wordmark — **"שיר אמיתי"** set in Frank Ruhl Libre 400 at ~1.6rem with subtle letter-spacing. Single line. Links to `/`. No Latin transliteration.
- **End side (left, in RTL)**: Nav links: `אודות · פסיכותרפיה גופנית · שיאצו · פתיחת קול · בלוג · יצירת קשר`
  - All three modality pages appear as direct top-level links — no "טיפולים" grouping label and no dropdown. Each link navigates directly to its therapy page.
- **Mobile**: hamburger → full-screen drawer that slides in from the right with staggered link reveal. Background is a frosted wash of the current page tint.

### 5.3 Footer
A calm, generous footer (~50vh on desktop).
- Large centered wordmark "שיר אמיתי" in display size, ~12% opacity — feels like a watermark goodbye.
- Three columns (RTL order):
  1. Navigation
  2. Contact — listed in the priority order from §5.4: **WhatsApp (primary, prominently styled) → phone → email** — all clickable
  3. Elsewhere (Facebook, Biosynthesis grad page)
- Bottom bar: copyright (auto year, Hebrew "© 2026 שיר אמיתי · כל הזכויות שמורות"), accessibility statement link, and the builder credit (see §5.3.1).
- A `BreathDivider` SVG wave separates footer from content above.

### 5.3.1 Builder credit (English, by design)

A single, deliberately tiny credit line — **the only English text on the entire site**, by explicit exception to §0.

- **Placement**: end of the footer's bottom bar, on the end side (left in RTL), set apart from the Hebrew copyright by a thin separator (` · ` or a 1px vertical rule).
- **Text**: `Built by Itiel Beeri`
- **Markup**: wrapped in `<span lang="en" dir="ltr">` so screen readers switch to English voice and the LTR text island renders correctly inside the surrounding RTL bottom bar.
- **Link**: the words "Itiel Beeri" link to `https://www.linkedin.com/in/itiel` with `target="_blank"`, `rel="noopener author"`.
- **Style**: `--fs-small` (~0.92rem), `--color-mist` (tertiary text), `letter-spacing: 0.04em`, Frank Ruhl Libre or Assistant 300 — whichever reads more elegantly at this size (likely the sans, given the Latin glyphs). Link has a subtle underline on hover only, drawing in from the inline-start side; matches the rest of the site's link motion.
- **Accessibility**: `aria-label="Built by Itiel Beeri — opens LinkedIn profile in new tab"` on the link. Visible focus ring per §10.
- **Not configurable via content TOML** — this credit is fixed in the Footer component source, not in `site.toml`. Rationale: it should not be accidentally removable by a non-technical edit of the content files, and it's a developer signature rather than site content.
- **RTL/LTR mixing**: the surrounding bottom bar stays `dir="rtl"`. The credit's `<span lang="en" dir="ltr">` creates a clean LTR island. The ` · ` separator before it (in source order) renders to the visual left of the Hebrew copyright thanks to RTL flow, which is the intended position.

Example markup (illustrative):
```html
<div class="footer-bottom" dir="rtl">
  <span>© <time>2026</time> שיר אמיתי · כל הזכויות שמורות</span>
  <a href="/accessibility">הצהרת נגישות</a>
  <span class="builder-credit" lang="en" dir="ltr">
    Built by <a
      href="https://www.linkedin.com/in/itiel"
      target="_blank"
      rel="noopener author"
      aria-label="Built by Itiel Beeri — opens LinkedIn profile in new tab"
    >Itiel Beeri</a>
  </span>
</div>
```

### 5.4 Contact channel preference — WhatsApp first, phone second, email last

**A site-wide rule that governs every place a contact action surfaces** (ContactPill, Header CTA if any, Footer column, Home closing section, Contact page, Therapy-page CTA strip, single-blog-post end CTA, 404 page):

1. **WhatsApp** — primary, visually dominant.
2. **Phone call** — secondary.
3. **Email** — tertiary.

This ordering is concretely expressed via:

- **Source order** — in every contact group's HTML, the WhatsApp link is the first child, phone second, email third. This also fixes the keyboard tab order (WhatsApp focuses first) and the screen-reader reading order.
- **Visual emphasis** — when the three appear together:
  - WhatsApp uses the **primary CTA style**: filled GlassCard with a stronger accent-tinted background, slightly larger icon (~1.15×), bolder weight on its label ("שליחת הודעה בוואטסאפ"). It's the visual anchor of the group.
  - Phone uses a **secondary style**: outlined/ghost variant of the same component, standard icon size, label "התקשרות" or "שיחת טלפון".
  - Email uses a **tertiary style**: text-with-icon only (no surrounding card), smallest in the visual hierarchy, label "שליחת מייל".
- **Single-action contexts** — wherever only ONE contact CTA appears (a single button at the end of a section, in a hero, etc.), it is **always WhatsApp**.
- **ContactPill collapsed state** — the single visible icon when collapsed is the **WhatsApp** glyph (not a generic chat bubble), in WhatsApp's recognizable accent green tinted toward the site's palette so it harmonizes with the watercolor (a muted seafoam-green, not the saturated brand green).
- **Page-load priority** — the WhatsApp link is the only contact link allowed to be `<a rel="...">` without `noopener` only when needed; default is `target="_blank"` for WhatsApp (mobile deep-links to the app, desktop opens WhatsApp Web), `tel:` for phone (no target), `mailto:` for email (no target). All three carry descriptive `aria-label`s in Hebrew.
- **Editorial copy** — copy that invites contact (CTAs, closing lines, hero subtexts) prefers wording that maps naturally to WhatsApp ("הודעה בוואטסאפ", "כתבו לי") over phone-centric phrasing. The TOML content files (§12.6) reflect this in their default placeholder strings.
- **JSON-LD** — `Person.contactPoint` array (§11.2) lists WhatsApp first (as a `contactPoint` with `contactType: "WhatsApp"` and the `wa.me` URL), then telephone, then email.

This preference is documented once here and referenced (rather than re-explained) by the sections below.

### 5.5 ContactPill (persistent floating CTA)
A small frosted-glass pill fixed at bottom-start corner (right in RTL), ~24px from edges.
- Collapsed: a single circular **WhatsApp** icon (~52px diameter) — per §5.4, the single representative channel.
- On hover/focus: expands to reveal three icon-buttons in this order — **WhatsApp (primary, larger), phone (secondary), email (tertiary)** — staggered fade-in following the same order.
- Mobile: always slightly visible, larger tap targets (min 48×48px), bottom-center.
- Hidden when scrolled within 200px of footer (footer already has these).
- Fully keyboard-accessible (Tab opens; Esc closes); `aria-expanded`, `aria-label` on every button. Tab order: WhatsApp → phone → email.

### 5.6 Reusable UI primitives
- **GlassCard** — `background: var(--color-glass)`, `backdrop-filter: blur(var(--blur-glass))`, soft border, gentle lift on hover (`translateY(-4px)` + shadow grow).
- **SoftImage** — `<picture>` wrapper that applies an SVG mask with feathered watercolor edges (so images look like they were painted, not cropped). Supports a "tint" prop that overlays the section's accent color at low opacity.
- **SectionHeading** — small Frank Ruhl Libre kicker label above (in Hebrew, e.g. "טיפול"), large Assistant 300 display title, thin underline that animates from 0 → 50px on reveal (drawn from the start side, i.e., right edge).
- **BreathDivider** — animated SVG sine wave that slowly oscillates (12s loop), used between sections.
- **ScrollReveal** — wraps children, adds `opacity 0 → 1` + `translateY(40px → 0)` over 900ms when entering viewport, staggered by `data-stagger` prop. Uses IntersectionObserver — no library needed.
- **ParallaxLayer** — sets a CSS variable based on scroll position; children consume it via `transform: translate3d(0, calc(var(--p) * <factor>), 0)`.

---

## 6. Page-by-Page Visual Plan

### 6.1 Home page (`/`)

**Overall scrolling experience:**
The watercolor background stays *fixed*; content scrolls *above* it as a series of frosted glass panels and feathered images. As the user scrolls, each section's accent tint fades into the background (via a `mix-blend-mode` overlay on the bg field), so the world subtly changes color section by section — lavender for psyche, teal for touch, rose/sand for voice — then returns to the neutral wash for the blog.

#### Sections (top → bottom):

**A. Hero (100vh)**
- Content floats directly on the watercolor — no enclosing card or box.
- Display title **"שיר אמיתי"** set in Heebo weight 100 (ultra-thin) — fades in elegantly over 1200ms. No letter stagger.
- A small Heebo 300 descriptor line above at ~0.92rem, ~0.08em letter-spacing, in `--color-ink-soft`, holding a single descriptor (placeholder, e.g., "מרחב לטיפול בגוף, נפש וקול").
- Short tagline (placeholder, 1 line, ~10 words): _"פסיכותרפיה גופנית · שיאצו · פתיחת קול"_.
- No scroll-cue element — the open design trusts the user to scroll naturally.
- On scroll-down: hero content fades to 0.4 opacity and scales to 0.95 via GSAP scrub.

**B. Intro / "מי אני בקצרה" (~120vh)**
- Two-column layout (RTL): the **start (right) column** holds a `SoftImage` placeholder for **Shir's portrait** (vertical, ~3:4); the **end (left) column** holds the paragraph text in a glass card.
  - **[CONTENT PLACEHOLDER — Portrait of Shir]** — *To be provided. Description: warm, natural light, soft expression, ideally in clinic or natural setting.*
- The portrait has slight parallax: moves up at 0.85× scroll speed; the text moves at 1× → creates a gentle "pulling apart" effect.
- Below: a soft CTA link "המשך לקרוא עליי →" → `/about`.
- The whole block is wrapped in an anchor so the entire area is clickable (per spec: "Maybe the entire element can be the link").

**C. Three therapies — a vertical triptych (~3× 100vh)**
The centerpiece of the home page.

Pattern repeated 3 times (Psychotherapy → Shiatsu → Voice):
- Full-viewport section. Background tints to the modality's accent at **max 55% opacity** (translucent — the watercolor is always visible through the tint).
- A wide horizontal layout (on desktop): half image, half text. Alternating sides per modality (image-right, image-left, image-right) for visual rhythm.
- Image area: `SoftImage` with a watercolor mask + a gentle scale-on-scroll (1.0 → 1.08 over the section's visible window).
- Text area: **open, no enclosing card** — text floats directly on the tinted watercolor:
  - Hebrew kicker in Heebo 300, ~0.95rem, `--color-ink-soft` (e.g., "טיפול בשיחה ובגוף")
  - Hebrew display title in Heebo 200 (e.g., "פסיכותרפיה גופנית")
  - Short paragraph (placeholder, 3–5 lines)
  - "להמשך קריאה ←" link styled as an underlined inline link (note: arrow points **left** — the "forward" direction in RTL)
- The entire card + image group is wrapped in an `<a>` going to the therapy page.
- Between modalities: a `BreathDivider` wave SVG, colored to gradient between the two accent colors.
- **Page transition trick:** as the user clicks into a therapy page, the image's watercolor shape *morphs* (via View Transition + shared element `transition-name`) into the hero of the destination page. This creates the "wash from one page to the next" feel.

**D. Blog teaser (~80vh)**
- A horizontal scroll-snap row of 3 latest article tiles (frosted cards with `SoftImage` thumbs).
- On desktop: simple grid of 3. On mobile: horizontal scroll-snap.
- "לכל הכתבות ←" link to `/blog`.

**E. Closing / contact invitation (~70vh)**
- Centered glass card, very minimal: a soft sentence ("יצירת קשר" placeholder), then three contact actions in the §5.4 priority order — a prominent **WhatsApp** GlassCard CTA on top, a secondary **phone** action below it, and a tertiary **email** link at the bottom. Single tap-target on mobile defaults to WhatsApp.
- Footer follows.

#### Home page parallax/scroll spec summary:
- Background image: translateY at 0.4× scroll speed (slowest).
- Decorative SVG leaves at corners: 0.7× speed.
- Glass cards: 1.0× (normal).
- Section accent overlays: cross-fade as `IntersectionObserver` thresholds 0.2 → 0.8.
- Smooth scroll: Lenis with `lerp: 0.085`.

---

### 6.2 About (`/about`)

A long-form, narrative page — Shir's story, training, modalities, philosophy.

**Sections:**
1. **Hero** — large display title **"אודות"** in Assistant 300, with a single Frank Ruhl Libre kicker line above (~0.95rem, e.g., "מעט עליי"), and a single line of placeholder intro. Background tint: neutral (sand-cream). No Latin subtitle.
2. **Portrait + opening paragraph** — same pattern as home intro but larger image (~16:10 horizontal). [CONTENT PLACEHOLDER — secondary portrait or clinic photo].
3. **Story timeline** — a single column of alternating text blocks and small inline images (decorative leaves between them). Vertical thin watercolor line on the right edge connects them, drawn-on-scroll (SVG `stroke-dashoffset` animation).
4. **Training & credentials** — a calm list inside a wide GlassCard. Includes a link to the Biosynthesis grad page (opens in new tab, with `rel="noopener"`).
5. **Philosophy / approach** — pull-quote styling: Frank Ruhl Libre 300 at large size (~`--fs-h1`), generous line-height, a watercolor brush-stroke SVG as the start-side accent (right edge in RTL).
6. **CTA row** — three GlassCards linking to the three therapies (image + title + 1 line each).
7. Footer.

---

### 6.3 Therapy pages (shared template)

All three therapy pages share a template, distinguished only by content + accent color:

| Page | Accent | Theme keyword (Hebrew) |
|---|---|---|
| `/psychotherapy` | lavender | "שיחה · נפש" |
| `/shiatsu` | teal | "מגע · גוף" |
| `/voice` | rose + sand | "קול · נשימה" |

**Sections:**
1. **Hero (100vh)** — full-width SoftImage on the start side (right, in RTL), text on the end side (left). Large Hebrew display title in Assistant 300, a Frank Ruhl Libre kicker line above it (no Latin), one-paragraph placeholder. Subtle motion: image breathes (3% scale oscillation, 8s loop) — gives a "living" feel.
2. **What is this? (placeholder)** — a wide reading column (max-width 65ch), centered. Generous line-height.
3. **What happens in a session** — a numbered sequence (3–5 steps) as a vertical list. Each step is a glass mini-card with a tiny inline illustration placeholder. Drawn-on-scroll line connecting them on the start side (right edge, in RTL).
4. **For whom / when** — two-column GlassCards: "מתאים ל..." / "טוב לפנות כאשר...". [CONTENT PLACEHOLDER text].
5. **Pricing / logistics (optional placeholder)** — calm row: location (פרדס חנה / זום), session length, price-on-request line.
6. **CTA strip** — "תיאום פגישה" with the three contact actions in the §5.4 priority order (WhatsApp primary, phone secondary, email tertiary).
7. **Related** — "מסלולים אחרים" — two cards linking to the other two therapies (uses the same teaser pattern as home).
8. **1–2 related blog posts** (auto-pulled by tag from MDX frontmatter).
9. Footer.

---

### 6.4 Blog index (`/blog`)

**Layout choice:** A mix between a tile grid and an editorial feel.

- **Hero band** — large display title **"בלוג"** in Assistant 300, with a Frank Ruhl Libre kicker line above (e.g., "מחשבות, רשימות, מסעות") + 1-line placeholder. No Latin.
- **Featured post** (latest) — full-width wide card with large SoftImage on right, title + excerpt on left. Slight scale-on-hover.
- **Article grid** — masonry-like 2-column layout on desktop (CSS `column-count: 2` or grid with varied row spans), single column on mobile. Each tile:
  - SoftImage thumb (placeholder)
  - Date (Frank Ruhl Libre 400, small size, in Hebrew format: e.g., "12 במרץ 2026")
  - Title (Assistant 400, ~1.4rem)
  - 2-line excerpt
  - Tag chip (frosted pill, tinted by tag)
  - Entire tile clickable → `/blog/[slug]`
- Tiles fade and lift in with stagger as user scrolls.
- **Optional tag filter** — a row of pill chips above the grid (purely client-side filtering with a tiny script). Phase 2.
- No pagination needed initially (assume <20 posts); when needed, add an infinite-scroll-via-intersection-observer.
- Footer.

---

### 6.5 Single blog post (`/blog/[slug]`)

Built from MDX in `src/content/blog/`.

- **Hero** — full-width SoftImage (post cover, placeholder), with title overlaid on a frosted card centered at the bottom. Below: date + reading time + tag chips.
- **Reading column** — max-width 65ch (Hebrew reads slightly wider comfortably than Latin; 60-68ch is the sweet spot), centered, generous line-height (1.85). Drop cap on first paragraph (Frank Ruhl Libre 500, ~3.5rem, deep green, floats to the **start side**, i.e., right in RTL — using `float: inline-start` / fallback `float: right`).
- MDX supports inline images (rendered with SoftImage), blockquotes (large Frank Ruhl Libre 300 with watercolor brush stroke SVG as `border-inline-start` accent), and headings.
- **Inline pull-quotes** auto-styled.
- **Share / actions** — sticky thin column on the side (desktop): copy link, share to Facebook, send via WhatsApp.
- **End of post** — author mini-card (Shir's portrait thumb + 1-line bio + link to `/about`).
- **Prev / Next post** — two large soft cards.
- **"חזרה לבלוג"** link.
- **Related therapy CTA** — if post is tagged with a therapy, show that therapy's teaser card.
- Footer.

---

### 6.6 Contact (`/contact`)

Minimal, calm page.
- Hero: large display title **"יצירת קשר"** in Assistant 300 with a Frank Ruhl Libre kicker line above (e.g., "מוזמנים לשיחה") + 1-line placeholder. No Latin.
- Centered GlassCard with the three contact actions in the §5.4 priority order:
  - **WhatsApp** (`https://wa.me/972525201162`) — primary, prominently styled CTA, display size, accent-tinted. Suggested copy: "שליחת הודעה בוואטסאפ".
  - **Phone** (clickable `tel:+972525201162`) — secondary, outlined/ghost style. Suggested copy: "התקשרות · 052-520-1162".
  - **Email** (`mailto:shir.amitai1@gmail.com`) — tertiary, text-with-icon only. Suggested copy: "shir.amitai1@gmail.com".
  - Facebook + Biosynthesis as smaller secondary links below.
- A brief "where" section: clinic in פרדס חנה (optional embedded static map image, NOT iframe — to keep static & private). Or just a text address placeholder.
- Footer.

---

### 6.7 404 page

- Same background field.
- Centered glass card: large **"הדף לא נמצא"** in Frank Ruhl Libre 300. Below it, a short poetic line in Hebrew (placeholder).
- Two links in Hebrew: **"לעמוד הבית"** (primary) and **"ליצירת קשר"** (secondary). Deliberately no link to the blog — the 404 should point the visitor to the two most-useful destinations, not offer a tour.

---

## 7. Atmosphere Image Generation Prompts

These are the prompts for the AI-generated **atmosphere** images. Content images (portraits, real session photos) are explicit placeholders elsewhere.

### 7.1 Master background — already exists (`background.jpg`)
Reuse as-is.

### 7.2 Per-page background variants (optional, recolored)
For each therapy page we want a *subtle* variation tinted toward its accent. Use the same prompt as the master background but adjust the color clause:

**Psychotherapy bg prompt:**
> A full-frame seamless abstract watercolor background. Strictly no text, no letters, no defined shapes. Ethereal, dreamy, fluid watercolor on cold-pressed paper. Soft, bleeding gradients of pale lavender, dusty mauve, powder blue, with breaths of cream and seafoam. Even distribution for vertical mobile crop. Aspect 16:9. Calm, introspective, deep but light. No bright reds, no harsh tones.

**Shiatsu bg prompt:**
> A full-frame seamless abstract watercolor background. Strictly no text, no letters, no defined shapes. Ethereal, dreamy, fluid watercolor on cold-pressed paper. Soft, bleeding gradients dominated by seafoam green, pale teal, soft sage, with whispers of cream and powder blue. Even distribution for vertical mobile crop. Aspect 16:9. Grounded, embodied, restorative. No bright reds, no harsh tones.

**Voice bg prompt:**
> A full-frame seamless abstract watercolor background. Strictly no text, no letters, no defined shapes. Ethereal, dreamy, fluid watercolor on cold-pressed paper. Soft, bleeding gradients of warm sand, gentle peach, dusty rose, and cream, with cool seafoam breaths to balance. Even distribution for vertical mobile crop. Aspect 16:9. Awakening, breathing, warm yet calm. No bright reds, no harsh tones.

### 7.3 Decorative SVG/PNG assets

**Watercolor leaf (corner decoration), prompt:**
> A single, isolated, abstract watercolor leaf shape on a fully transparent background. Soft seafoam green and pale teal bleeds. Loose, organic, hand-painted feel with feathered edges. Slight asymmetry. No outline. Visible cold-pressed paper texture inside the leaf. PNG with transparency, 1024×1024.

**Watercolor brush stroke (divider / quote accent), prompt:**
> A single horizontal watercolor brush stroke on a fully transparent background. Pale lavender fading to sand on the right. Loose, tapered ends, feathered edges, hand-painted. No outline. PNG with transparency, 1600×200.

**Soft blossom / floral spot (subtle decoration), prompt:**
> A loose, abstract watercolor floral suggestion — no defined petals, just hinted blooms in dusty rose and cream. Fully transparent background. Hand-painted feel, feathered, dreamy. PNG, 800×800.

**Mask textures (for SoftImage feathered edges):**
> A grayscale watercolor mask: white center bleeding to transparent black at the edges, irregular feathered organic shape, on transparent background. PNG 1600×1200, used as CSS mask-image.

### 7.4 Section illustrations (atmosphere, not content)

**Psychotherapy section illustration prompt:**
> Abstract watercolor illustration suggesting two human silhouettes in conversation, very loose, no facial features, soft lavender and cream washes, dreamy and meditative, hand-painted on cold-pressed paper, no outlines. Transparent or paper-white background. Square 1200×1200.

**Shiatsu section illustration prompt:**
> Abstract watercolor illustration suggesting a pair of hands resting gently on a reclined body, extremely loose and abstract, no faces, no detail, seafoam green and warm cream washes, restorative and grounded feel, hand-painted, no outlines. Transparent or paper-white background. Square 1200×1200.

**Voice section illustration prompt:**
> Abstract watercolor illustration suggesting open lips, breath, or sound waves emerging — purely impressionistic, no realistic features, warm rose and sand washes with gold light, awakening and warm, hand-painted on cold-pressed paper. Transparent or paper-white background. Square 1200×1200.

---

## 8. Content Placeholders Inventory

Files/places where content/images need to be filled later:

| Placeholder ID | Where | Type | Description |
|---|---|---|---|
| `IMG_PORTRAIT_PRIMARY` | Home intro, About intro | Image | Shir's main portrait, vertical 3:4 |
| `IMG_PORTRAIT_SECONDARY` | About story | Image | Alternative photo (clinic, hands, natural setting) |
| `IMG_CLINIC` | Contact page | Image | Clinic space in Pardes Hana |
| `TXT_HERO_TAGLINE` | Home hero | Text | One-line motto |
| `TXT_HOME_INTRO` | Home intro block | Text | ~3 lines about Shir |
| `TXT_HOME_PSY` / `_SHI` / `_VOC` | Home triptych | Text | One paragraph per therapy |
| `TXT_HOME_BLOG_KICKER` | Home blog teaser | Text | One line |
| `TXT_ABOUT_*` | About page sections | Text | Story, training, philosophy |
| `TXT_THERAPY_*_*` | Each therapy page | Text | Intro, what-happens, for-whom, pricing |
| `BLOG_POSTS` | `src/content/blog/` | MDX | Real posts later |
| `LINK_OG_IMAGE` | All `<head>` | Image | OG share image (1200×630) |

All placeholders are clearly tagged in code with comments `<!-- PLACEHOLDER: TXT_HOME_INTRO -->` so they're trivially findable later.

---

## 9. Animation & Interaction Spec (detailed)

### 9.1 Page load
1. Body opacity 0 → 1 over 400ms.
2. BackgroundField fades in over 800ms.
3. Hero content reveals: title letter-stagger (60ms each) starts at 300ms; subtitle at 900ms; scroll-cue at 1400ms.

### 9.2 Scrolling (powered by Lenis + GSAP ScrollTrigger)
- Lenis config: `lerp: 0.085`, `wheelMultiplier: 1`, `touchMultiplier: 1.5` (gentler on mobile), `smoothWheel: true`, `smoothTouch: false` (native touch feels better).
- Lenis drives GSAP's ticker: on each Lenis frame, call `ScrollTrigger.update()`; register `ScrollTrigger.scrollerProxy()` so ScrollTrigger reads Lenis's virtual scroll position. Standard documented pattern.
- ScrollTrigger drives:
  - **Pinned sections** on the home triptych (each modality pins for ~80vh while its accent overlay scrubs in/out).
  - **Scrubbed timelines** for image scale/parallax (`scrub: 1` — 1s catch-up for buttery feel).
  - **Toggle classes** for the header glass-bar (`scroll > 80`).
  - **Stagger reveals** for tiles/cards on enter.
- A single `--scroll-y` CSS variable is also set per frame so pure-CSS layers (background field, decorative SVGs) can react without JS-driven transforms.

### 9.3 Reveal on scroll
- For simple enter-fades: IntersectionObserver with `threshold: 0.15`, `rootMargin: '0px 0px -10% 0px'`. Elements with `data-reveal` get class `is-visible` → CSS handles fade + translate. No library needed.
- For complex/scrubbed reveals (drawn-on-scroll SVG lines, scale-on-scroll images, accent-color cross-fades): GSAP ScrollTrigger timelines.
- Optional `data-stagger="80"` cascades children (uses GSAP `stagger` for scrub-friendly, CSS `transition-delay` for the simple IO path).

### 9.4 Cross-page transitions (Astro ClientRouter)
- Default: `fade` transition (600ms cross-fade) for all routes.
- Specific shared elements:
  - Therapy teaser image on home ↔ therapy hero image → shared `transition-name: therapy-img-{slug}` so the image morphs across.
  - Blog tile image ↔ blog post hero → shared `transition-name: post-cover-{slug}`.
- Header logo persists across all transitions (`transition-persist`).
- The BackgroundField also persists (`transition-persist`), so the watercolor never blinks — only its overlay tint shifts.

### 9.5 Hover micro-interactions
- Links: underline draws in from the **start side (right edge, in RTL)** on hover (200ms ease-out), using `background-image` linear-gradient + `background-size` animation so it works with logical direction.
- GlassCard: `transform: translateY(-4px)` + shadow grow over 400ms.
- Buttons: background tint shifts subtly, no pop.
- Cursor: optional custom large soft-circle cursor follower on desktop (delayed lerp 0.15), hidden on touch devices. Disabled if `prefers-reduced-motion`.

### 9.6 Idle ambient motion
- Background radial blobs drift 60–90s loop.
- Echoes (subtle background watermarks of the wordmark, like the placeholder page) breathe over 14s.
- Decorative leaf SVGs sway with `transform: rotate(±2deg)` over 8s.

### 9.7 Reduced motion
If `(prefers-reduced-motion: reduce)`:
- Lenis disabled (native scroll).
- All transform-based animations replaced with simple opacity transitions ≤ 200ms.
- Idle drifts disabled.
- ClientRouter `fallback: 'none'`.

---

## 10. Accessibility Plan

- **Semantic HTML**: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<footer>`, proper heading hierarchy (one `<h1>` per page).
- **Lang & direction**: `<html lang="he" dir="rtl">` on every page, no exceptions. The site is Hebrew-only — there is no `<span lang="en">` usage anywhere on the rendered surface (per §0).
- **Skip link**: visible-on-focus "דלג לתוכן" → `#main`.
- **Color contrast**: all text on glass cards verified ≥ 4.5:1 against the watercolor (we lay a `rgba(255,255,255,0.42)` floor under text to guarantee contrast). For text directly on the watercolor field, we use an additional local glass plate.
- **Focus rings**: a custom 2px solid `--color-ink` outline with 3px offset on all interactive elements. Never `outline: none` without replacement.
- **Keyboard navigation**: every link/button reachable; ContactPill traps focus when open; mobile drawer traps focus and supports Esc to close.
- **ARIA**: `aria-label` on icon-only buttons (whatsapp/phone/email/menu — same priority order as §5.4). `aria-current="page"` on active nav link. `aria-expanded` on dropdowns.
- **Images**: every `<img>` has meaningful `alt`. Decorative images: `alt=""` + `role="presentation"`.
- **Forms**: none on this site (no contact form); contact via direct links — already accessible.
- **Animations**: respect `prefers-reduced-motion` (see §9.7). No animation autoplays for >5s without ability to pause.
- **Hit targets**: minimum 44×44px on mobile (48px on the ContactPill).
- **Reading order**: source order matches visual order even with RTL flex/grid mirroring.
- **Screen reader landmarks**: each major section has an `aria-labelledby` referencing its heading.
- **Accessibility statement page** (linked from footer) — short plain-Hebrew statement of compliance + contact email for accessibility issues.

---

## 11. SEO Plan

### 11.1 Per-page meta
Every page sets:
- `<title>` — Hebrew primary, " | שיר אמיתי" suffix; ≤ 60 chars.
- `<meta name="description">` — unique, 140–160 chars, Hebrew.
- `<link rel="canonical">`.
- Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:locale="he_IL"`).
- Twitter card tags (`summary_large_image`).
- `<meta name="robots" content="index, follow">`.

### 11.2 Structured data (JSON-LD)
- **Sitewide**: `Person` schema for Shir (name "שיר אמיתי", jobTitle in Hebrew, `sameAs`: Facebook + Biosynthesis, `address.addressLocality`: "פרדס חנה"). The `contactPoint` array lists channels in the §5.4 priority order: WhatsApp first (`{ "@type": "ContactPoint", "contactType": "WhatsApp", "url": "https://wa.me/972525201162" }`), then telephone, then email. Note: per §0 the `Person.name` is Hebrew-only; no Latin `alternateName` is included.
- **Therapy pages**: `Service` schema (provider = Person, serviceType, areaServed).
- **Home**: `LocalBusiness` (or `HealthAndBeautyBusiness`) with hours-on-request and contact info.
- **Blog index**: `Blog` schema.
- **Single post**: `BlogPosting` with `headline`, `datePublished`, `dateModified`, `author`, `image`, `inLanguage: "he"`.

### 11.3 Technical SEO
- `sitemap.xml` — auto-generated via `@astrojs/sitemap` integration (MIT).
- `robots.txt` — allow all, point to sitemap.
- Clean URLs (no `.html`), trailing slash consistent.
- Pre-rendered HTML (Astro default) — instant crawl.
- Fast LCP target: hero text ≤ 1.5s on 4G. Preload hero font subset.
- Images: AVIF/WebP via Astro `<Image />`, `loading="lazy"` except hero, explicit width/height to avoid CLS.
- `hreflang="he"` declared.

### 11.4 Content SEO hooks
- Each therapy page has a clear `<h1>` matching its primary keyword.
- Blog posts get **Hebrew slugs** (e.g., `/blog/פתיחת-הקול`), properly URL-encoded. Google indexes Hebrew slugs well and they reinforce the Hebrew-only nature of the site. Astro handles UTF-8 slugs natively. If a specific post benefits from a shorter ASCII slug for sharing, it can be set per-post in MDX frontmatter — but the **default is Hebrew**.
- Internal linking dense (see §3.1).

### 11.5 Performance budget
- Initial HTML + critical CSS ≤ 30 KB.
- JS shipped to home page ≤ 60 KB (Lenis ~3 KB + GSAP core ~25 KB + ScrollTrigger ~10 KB + tiny app code, all minified+gzipped). GSAP is loaded with `defer` and is not on the critical path.
- LCP image ≤ 120 KB (AVIF).
- Total home page weight (above-the-fold) ≤ 250 KB.
- Lighthouse target: Performance 95+, Accessibility 100, Best Practices 100, SEO 100.

---

## 12. Responsive Plan

Breakpoints (mobile-first):
```
--bp-sm:  480px
--bp-md:  768px
--bp-lg:  1024px
--bp-xl:  1280px
--bp-xxl: 1600px
```

- **<480 (phones)**: single column everywhere; therapy triptych becomes stacked full-width sections; horizontal blog scroll-snap; mobile nav drawer; ContactPill bottom-center.
- **480–768 (large phones, small tablets)**: same as above with slightly larger type and spacing.
- **768–1024 (tablets)**: 2-column About/Therapy layouts engage; nav becomes inline (no drawer).
- **1024–1280 (laptops)**: full design as described, ~1100px content max-width.
- **>1280**: extra horizontal margin; max content width capped at 1240px; type scales gracefully via `clamp()`.

Touch considerations:
- All hover effects also fire on `:focus-visible`.
- Hover-only effects (cursor follower, parallax intensity) disabled on coarse pointers.
- Scroll-snap used judiciously on mobile (blog teaser only) to avoid hijacking.

---

## 12.5 RTL Implementation Checklist

A concrete checklist to make sure the Hebrew-only/RTL constraint from §0 is honored everywhere in code.

**HTML / document level**
- [ ] `<html lang="he" dir="rtl">` on every page (set in `BaseLayout.astro`, no per-page override).
- [ ] No `lang="en"` attributes anywhere on rendered elements.
- [ ] `<meta name="language" content="Hebrew">` and `og:locale="he_IL"` in `<head>`.
- [ ] Sitemap entries use Hebrew slugs (URL-encoded).

**CSS — use logical properties everywhere**
- [ ] `margin-inline-start` / `margin-inline-end` instead of `margin-left` / `margin-right`.
- [ ] `padding-inline-*`, `border-inline-*`, `inset-inline-*`.
- [ ] `text-align: start` / `end` instead of `left` / `right`.
- [ ] `float: inline-start` / `inline-end` (with `float: right` / `left` fallback for older Safari).
- [ ] Flex/grid: rely on natural direction; never use `row-reverse` to "fix" RTL — let `dir="rtl"` do its work.
- [ ] Transforms that imply direction (`translateX`): always derived from logical scroll/position values, mirrored when `dir=rtl`. Helper: a `--dir-x: -1` CSS variable scoped to `[dir="rtl"]`, used as `transform: translateX(calc(var(--p) * var(--dir-x) * 1px))`.

**Iconography & directional UI**
- [ ] "Next/forward" arrow: ← (Unicode `\2190` or SVG pointing left). "Previous": → (right).
- [ ] Carousel/slider: swipe left = next post. Indicators read right-to-left.
- [ ] Mobile drawer: slides in from the **right** edge.
- [ ] Header dropdown panel: aligns to its trigger's start edge (right).
- [ ] ContactPill: bottom-**right** corner on desktop, bottom-center on mobile.
- [ ] Scrollbar: native; on Webkit we may apply a thin custom style symmetrical to both sides.
- [ ] Animation `from`/`to` directions: reveals slide in from the right (start side); underline draws from right.

**Typography**
- [ ] Both font families requested with `&subset=hebrew` on Google Fonts URL.
- [ ] No `font-style: italic` on Hebrew text. Use weight contrast and font switch instead.
- [ ] Punctuation: use Hebrew quotation marks (״ for double, ׳ for single — Geresh/Gershayim) where appropriate; ASCII `"` is acceptable in code/URLs but not in display copy.
- [ ] Numbers in body text: written in Hebrew word form for small numbers (e.g., "שלוש שנים") or Western digits for years/phones — never Eastern Arabic-Indic digits.
- [ ] Dates: Hebrew month names ("12 במרץ 2026") in display; ISO format in `<time datetime="…">`.

**Form & input considerations (even though we have no form)**
- [ ] `tel:` and `mailto:` links: the `href` keeps Latin digits (`+972...`) but the visible label uses standard Israeli format: "052-520-1162".
- [ ] WhatsApp URL: `https://wa.me/972525201162` (Latin, in `href` only).

**Content & SEO**
- [ ] All `<title>`, `<meta description>`, `og:*`, `twitter:*` strings in Hebrew.
- [ ] All `alt` and `aria-label` strings in Hebrew.
- [ ] JSON-LD `inLanguage: "he"`; `Person.name: "שיר אמיתי"` (no `alternateName` field with Latin transliteration — removed per §0).
- [ ] `hreflang="he"` declared; no `x-default` to an English alternate (there is none).

**QA**
- [ ] Visual diff with `dir="ltr"` toggle temporarily applied — every layout should visibly mirror; if anything stays in place, it's a leak of physical properties (fix it).
- [ ] Screen reader pass with NVDA/VoiceOver in Hebrew voice — reading order must match visual order.
- [ ] All text long-words and URLs do not overflow narrow viewports (use `overflow-wrap: anywhere` on body text).

---

## 12.6 Content Authoring — Content as Data

To keep the website realistically maintainable (adding blog posts, editing copy, swapping images) without touching markup, styles, or framework code, **all editable content is extracted into typed data files**, separate from the components that render it. The components read from these files at build time.

**Authoring format: TOML** — chosen over YAML for non-technical authoring. TOML's advantages here:
- No whitespace-significance — indentation is decorative, not structural. A misplaced space cannot break the build.
- Less ambiguous quoting rules — strings are always quoted, so there's no "is this a string or a number/boolean" gotcha (YAML's "Norway problem" — `no` interpreted as `false`).
- Multi-line strings (`"""..."""`) handle Hebrew paragraphs cleanly with no escape characters.
- Comments (`#`) are supported, useful for inline guidance to Shir.
- Section headers (`[section]`, `[[arrays]]`) make file structure visually obvious without indentation.

Blog posts remain **MDX** (TOML for everything else, MDX where rich prose + inline components matter — i.e., long-form articles).

### 12.6.1 Content directory layout

```
src/content/
├── site.toml                       # global: brand name, tagline, contact info, social links, footer copy
├── pages/
│   ├── home.toml                   # hero line, intro paragraph, three teaser blurbs, closing line
│   ├── about.toml                  # all about-page sections (story blocks, training items, philosophy quote)
│   ├── contact.toml                # contact-page copy, location text
│   └── 404.toml                    # 404 page copy
├── therapies/                      # one MD/MDX per modality — TOML frontmatter + body sections
│   ├── psychotherapy.md
│   ├── shiatsu.md
│   └── voice.md
├── blog/                           # blog posts as MDX with TOML frontmatter
│   ├── _example.mdx
│   └── …
├── images.toml                     # central manifest: image id → file path + Hebrew alt + optional caption + credit
└── nav.toml                        # nav structure (label + href + optional accent token)
```

**Markdown/MDX frontmatter:** Astro Content Collections accept TOML frontmatter delimited by `+++ ... +++` (vs. `--- ... ---` for YAML). Therapy and blog files use the `+++` convention so authors only ever encounter one syntax across the whole content directory.

### 12.6.2 Schemas (Astro Content Collections + Zod)

Every collection has a Zod schema in `src/content/config.ts`. The build **fails with a clear Hebrew-context error** if a required field is missing or malformed — protecting Shir from creating a broken page silently.

Example schemas (illustrative):

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const therapies = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),                          // e.g. "פסיכותרפיה גופנית"
    kicker: z.string(),                         // e.g. "טיפול בשיחה ובגוף"
    accent: z.enum(['lavender', 'teal', 'rose-sand']),
    slug: z.string(),                           // URL slug (Hebrew allowed)
    heroImage: z.string(),                      // id from images.toml
    summary: z.string(),                        // 1–2 lines for home teaser
    order: z.number(),                          // display order on home triptych
    relatedBlogTags: z.array(z.string()).optional(),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.coerce.date(),
    cover: z.string().optional(),               // id from images.toml
    tags: z.array(z.string()).default([]),
    relatedTherapy: z.enum(['psychotherapy', 'shiatsu', 'voice']).optional(),
    order: z.number().int().positive().optional(), // featured rank on blog index + home teaser
    draft: z.boolean().default(false),
  }),
});

export const collections = { therapies, blog };
```

`site.toml`, `pages/*.toml`, `images.toml`, `nav.toml` are loaded via a tiny `src/lib/content.ts` helper. TOML parsing uses **`smol-toml`** (MIT, ~5 KB, modern spec-compliant TOML 1.0 parser, zero dependencies, faster than the alternatives). The helper:
1. Reads the file at build time (Node `fs`).
2. Parses with `smol-toml`.
3. Validates against a Zod schema (same pattern as Content Collections, just for non-MDX data).
4. Returns a typed object — fully tree-shakable in the build output.

Astro also has the **`astro:content` data collections** API which supports TOML natively via a custom loader function (`type: 'data'` + a `loader` that parses TOML). For consistency, we use the same `smol-toml`-backed loader for both standalone TOML files and data collections.

### 12.6.3 Authoring shape examples

`src/content/pages/home.toml`:
```toml
# הקדמה: זהו הקובץ הראשי של דף הבית. ערכי רק טקסטים בין הגרשיים.

[hero]
title       = "שיר אמיתי"
tagline     = "פסיכותרפיה גופנית · שיאצו · פתיחת קול"
scroll_cue  = "גלילה"

[intro]
portrait    = "shir-portrait-1"       # מזהה מתוך images.toml
cta_label   = "המשך לקרוא עליי"
cta_href    = "/about"
paragraph   = """
כאן מתחיל הטקסט של ההקדמה.
כמה שורות חמות וקצרות.
ניתן לכתוב מספר שורות בין שלושת הגרשיים.
"""

# שלושת קוביות הטיפולים נשלפות אוטומטית מתיקיית therapies/
# (ממוינות לפי השדה order) — אין צורך לרשום אותן כאן.

[teasers.blog]
label       = "מהבלוג"
cta_label   = "לכל הכתבות"

[closing]
enabled     = true
line        = "נשימה אחת. כאן. עכשיו."
```

`src/content/images.toml`:
```toml
[shir-portrait-1]
file    = "/img/content/shir-portrait-1.jpg"
alt     = "דיוקן של שיר אמיתי באור טבעי רך"

[shiatsu-illustration]
file    = "/img/content/shiatsu-illustration.png"
alt     = "איור מים אבסטרקטי בגווני ירוק רך הרומז על מגע מרפא"
credit  = "נוצר באמצעות AI"
```

`src/content/therapies/shiatsu.md` (TOML frontmatter, Markdown body):
```markdown
+++
title            = "שיאצו"
kicker           = "טיפול במגע"
accent           = "teal"
slug             = "shiatsu"
hero_image       = "shiatsu-hero"
summary          = "תיאור קצר של שתיים-שלוש שורות לכרטיס בדף הבית."
order            = 2
related_blog_tags = ["שיאצו", "מגע", "גוף"]
+++

## מה זה שיאצו?

הטקסט המלא של דף השיאצו כאן, ב-Markdown רגיל.
ניתן להוסיף כותרות, פסקאות, ציטוטים, ותמונות.
```

### 12.6.4 How components consume content

Components stay focused on layout & motion. Example (illustrative):

```astro
---
// src/pages/index.astro
import { getCollection, getEntry } from 'astro:content';
import { loadToml } from '../lib/content';
const home = await loadToml('pages/home.toml', homeSchema);
import Hero from '../components/home/Hero.astro';
import TherapyTeaser from '../components/home/TherapyTeaser.astro';

const therapies = (await getCollection('therapies')).sort(
  (a, b) => a.data.order - b.data.order
);
---
<Hero {...home.hero} intro={home.intro} />
{therapies.map(t => <TherapyTeaser entry={t} />)}
```

The component never contains the Hebrew copy itself — it only renders fields handed to it.

### 12.6.5 Image workflow

- Content images live in `public/img/content/` (portraits, illustrations).
- Atmosphere/decor images live in `public/img/bg/` and `public/img/decor/`.
- Every image referenced from content goes through `images.toml` and gets an **id** — so renaming the underlying file is a one-line change and alt text lives next to the image, not duplicated across pages.
- New images: drop the file in the right folder, add an entry to `images.toml`, reference its id from page/post content.

### 12.6.6 Shir's authoring flow (no admin UI, github.dev path)

This is the realistic flow given we're not bundling a CMS:

1. Open `https://github.dev/<owner>/shir-website` (browser-based VS Code, free, no install). The TOML language extension is auto-suggested by VS Code and gives syntax highlighting + inline error squiggles.
2. Navigate to `src/content/` and the relevant `.toml` (or `.md`/`.mdx`) file.
3. Edit Hebrew text **between the double-quotes**, or inside `"""..."""` for multi-line. Do not change the keys (the words before `=`), the `[section]` headers, or any line that doesn't contain Hebrew.
4. For a new blog post: duplicate `src/content/blog/_example.mdx`, rename to a Hebrew slug, edit TOML frontmatter (between `+++` lines) + Markdown body.
5. Commit + push from the in-browser source-control panel.
6. Cloudflare Pages rebuilds automatically in ~60 seconds; the site updates.

A short Hebrew authoring guide (`AUTHORING.md` at repo root, ~1 page) is included in the repo describing exactly the above with screenshots — including a clear "do edit these / don't edit these" diagram of a sample TOML file.

### 12.6.7 Future consideration — visual CMS (not part of this plan)

If/when Shir wants form-based editing instead of TOML/MDX, the recommended option is **Sveltia CMS** (MIT, an actively-maintained modern fork of Decap CMS). It:

- Mounts as a single static `/admin/index.html` page in this same site.
- Edits the **same files** in `src/content/` via GitHub's API — the content structure designed above is compatible as-is. (Note: Sveltia's native format is YAML/JSON frontmatter; a small format-converter shim in the OAuth proxy reads/writes the project's TOML files so the on-disk format stays TOML. Alternatively, the CMS could write a parallel set of YAML files that the build merges — to be decided when/if CMS is adopted.)
- Provides Hebrew-labeled form fields and full RTL admin UI (Decap's RTL story is weaker; Sveltia is the better choice for Hebrew sites today).
- Authenticates via GitHub OAuth (free, via a Cloudflare Worker proxy or GitHub device flow).
- Adds zero runtime cost — it's still a fully static site.

Adoption requires only: adding `/public/admin/index.html` + `/public/admin/config.yml` describing the same Zod schemas in Sveltia's collection format, plus a 30-line OAuth proxy. **Not implemented in v1**; documented here so the content structure stays compatible.

---

## 12.7 Extensibility & Design System Hygiene

The plan defines components and tokens; this section formalizes the **patterns** that keep new pages, sections, and features on-theme without invention or drift.

### 12.7.1 Theming registry

Modality accents (currently lavender / teal / rose-sand) are formalized as a **theme registry**, not loose mentions in prose.

`src/styles/themes.css`:
```css
[data-theme="default"]      { --accent: var(--color-cream); --accent-soft: var(--color-paper); }
[data-theme="psychotherapy"]{ --accent: var(--color-lavender); --accent-soft: #e5dcf0; }
[data-theme="shiatsu"]      { --accent: var(--color-teal);     --accent-soft: var(--color-seafoam); }
[data-theme="voice"]        { --accent: var(--color-rose);     --accent-soft: var(--color-sand); }
```

Every page sets `<body data-theme="…">` (or a section wrapper does, for the home triptych). All theme-sensitive styling (background tint overlay, link underline color, accent dots, section glow) reads `var(--accent)` — never a hardcoded color.

Adding a 4th modality later = (1) add a row to `themes.css`, (2) create the therapy `.md` file with `accent: <new-key>`. Nothing else changes.

### 12.7.2 Icon system

A single inline SVG sprite, **not** individual `<img>` tags or an icon font.

- Source: `src/icons/*.svg` — one file per icon, optimized via SVGO.
- Build step (Astro integration `astro-icon`, MIT) bundles them into a tree-shakable component:
  ```astro
  <Icon name="phone" />  <!-- renders inline SVG, currentColor, no extra HTTP request -->
  ```
- Stroke icons only (no fills), `stroke-width: 1.5`, rounded caps — matches the soft visual language.
- Initial set (~12 icons): `phone`, `whatsapp`, `mail`, `facebook`, `menu`, `close`, `arrow-forward` (points left), `arrow-back` (points right), `arrow-down`, `external`, `quote`, `share`.
- Adding a new icon: drop optimized SVG into `src/icons/`, use `<Icon name="newname" />`. No CSS changes.
- Accessibility: every `<Icon>` requires either a `label="…"` (Hebrew) prop → renders as `<svg role="img"><title>…</title></svg>`, or `decorative` → `aria-hidden="true"`.

### 12.7.3 Component preview route (`/_design`)

A single hidden route, `/_design/`, built at build time but **excluded from `sitemap.xml` and `robots.txt`** (and gated by a check on `import.meta.env.PROD ? noindex : index`), showing each shared component in its various states:

- All typographic styles (display, h1–h4, body, kicker, caption, quote).
- All buttons (default, hover, focus, disabled).
- GlassCard in light/tinted variants.
- SoftImage with each watercolor mask.
- BreathDivider in all theme accents.
- ScrollReveal stagger demo.
- Icon grid (all available icons + names).
- Theme registry preview (each theme applied to a sample section).
- Color palette swatches with token names + hex.

This is the team's Storybook-equivalent — no extra dependency, just an Astro page. It doubles as a regression check ("did I break the GlassCard?") and as a reference for future authors.

### 12.7.4 Recipes — documented patterns for common extensions

The canonical way to build common new things lives in **`AGENTS.md §8.4`** (the "Recipes" section), so the design system isn't reinvented per addition. Each recipe there is a short numbered procedure: a brief description, the components to compose, the tokens to use, and a minimal code skeleton. `AGENTS.md` is the single developer/agent guide for this repo — there is no separate `RECIPES.md`.

The recipes covered (see `AGENTS.md §8.4` for full procedures):

1. **Add a new blog post** — duplicate `_example.mdx`, edit frontmatter + body, commit.
2. **Add a new therapy / modality** — add to `themes.css`, create `src/content/therapies/<slug>.md`, optionally a new accent in §2.1.
3. **Add a "testimonials" section to a page** — compose: `SectionHeading` + grid of `GlassCard`s with a quote glyph icon. Reads from `src/content/testimonials.toml`.
4. **Add a FAQ accordion to a therapy page** — uses `<details>`/`<summary>` styled as GlassCards, animated open with `interpolate-size: allow-keywords` + reduced-motion fallback. Reads from `faq` array in the therapy MD frontmatter.
5. **Add a "events / workshops" page** — create a new content collection mirroring `blog`'s schema, copy the blog index page as starting point, add nav entry in `nav.toml`.
6. **Add a new full page** (e.g., "Press") — copy `about.astro` as starting template, create `src/content/pages/press.toml`, add nav entry.
7. **Add a new image** — drop file in `public/img/content/`, register in `images.toml` with Hebrew alt, reference by id.
8. **Swap an atmosphere image** (e.g., regenerate the voice section bg) — copy the relevant prompt from §7, generate, replace file in `public/img/bg/`, no code change.
9. **Tweak the palette globally** — edit `src/styles/tokens.css` only. Every component picks up the change.
10. **Add a CTA button variant** — extend `CTAButton.astro` with a new `variant` prop; document in `/_design`.

Each recipe explicitly references the tokens, components, and content files it touches — so the addition stays on-theme by construction.

### 12.7.5 Data-driven home & nav

Two specific concrete extensibility wins delivered by §12.6's content structure, called out explicitly:

- **Nav is data-driven** — `Header.astro` reads `src/content/nav.toml`. Adding a nav link = one TOML entry.
- **Home triptych is data-driven** — pulled from the `therapies` collection ordered by the `order` field. Reordering, adding a 4th, or temporarily hiding (`draft: true`) one modality requires no code change.

### 12.7.6 What the plan deliberately does NOT formalize

To avoid over-engineering for a small site:
- No design-tokens build pipeline (Style Dictionary, etc.) — plain CSS variables are enough.
- No formal Storybook installation — `/_design` is sufficient and free.
- No component testing framework beyond a manual visual pass on `/_design` + Lighthouse on the live build.
- No i18n framework — site is Hebrew-only by spec.

---

## 13. Implementation Phases

### Phase 1 — Foundation (1–2 days of work)
- Astro project setup, Cloudflare Pages deploy hook.
- Design tokens, themes registry, base CSS, typography.
- Content collections + Zod schemas (`src/content/config.ts`), TOML loader helper (`smol-toml` + Zod, in `src/lib/content.ts`).
- Icon system (`Icon.astro` + initial SVG set).
- BaseLayout, Header (data-driven from `nav.toml`), Footer, ContactPill, BackgroundField.
- Reveal/parallax script primitives.
- `/_design` preview route scaffold.
- 404 page.

### Phase 2 — Home page (1–2 days)
- All sections wired, reading from `src/content/pages/home.toml` + `therapies` collection.
- Scroll choreography tuned.
- View transitions integrated.

### Phase 3 — About + Therapy pages (1–2 days)
- Build About (reads `about.toml`); build single therapy template `[slug].astro` driven by the `therapies` content collection (one template, three data files).
- Cross-links live.

### Phase 4 — Blog (1 day)
- Blog content collection, index page, single-post page, one example MDX post.

### Phase 5 — Polish & Authoring (1 day)
- Accessibility audit (axe, keyboard pass).
- Lighthouse pass.
- SEO meta + JSON-LD on every page (data sourced from `site.toml`).
- Generate atmosphere images and wire them in via `images.toml`.
- Final motion-tuning pass.
- Populate `/_design` with all component states.
- Write `AUTHORING.md` (Hebrew). `AGENTS.md` (developer/agent guide, including recipes — see §12.7.4) is maintained throughout, not deferred to this phase.

### Phase 6 — Content (later, manual)
- Replace all `PLACEHOLDER:` markers with real text and images.

---

## 14. Open Questions / Decisions Deferred

These can be answered/decided during build; none block starting:
1. Should the contact page be a full page or just an anchor section on Home? **Plan defaults to both** (anchor on home + full `/contact`).
2. Is a newsletter signup desired on the blog? **Plan defaults to no** (static-only constraint; can be added later via Buttondown/Mailchimp embed).
3. Hebrew/English bilingual full site, or Hebrew-only? **Decided: Hebrew-only, fully RTL — see §0.** No Latin script anywhere on rendered surfaces. The placeholder page's "Shir Amitai" subtitle and "Coming Soon" English line are removed in the production build.
4. Cursor follower on desktop — yes/no? **Plan defaults to yes, easily togglable**.

---

## 15. Summary

This plan delivers:
- A **stunning, calm, breathing** website that visually embodies Shir's holistic practice.
- A **persistent watercolor world** that wraps every page; transitions between pages feel like a wash of color, not a navigation.
- **Three modalities** distinguished by accent color while feeling unified.
- **Astro** for static output + smooth page transitions + tiny JS payload.
- **Lenis + Motion One** for the silky scroll and reveal choreography.
- **Full accessibility, SEO, and responsiveness** baked in from line one.
- **Clear separation** between content placeholders (to be filled manually) and atmosphere images (to be AI-generated from the provided prompts).

The visitor's experience: they land, they breathe, they scroll, and they slowly understand — without reading much — that this is a space of touch, voice, and care.
