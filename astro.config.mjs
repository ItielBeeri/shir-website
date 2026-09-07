// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkBreaks from 'remark-breaks';

export default defineConfig({
  site: 'https://www.shir-amitai.com',
  markdown: {
    remarkPlugins: [remarkBreaks],
  },
  integrations: [
    mdx(),
    sitemap(),
    icon({
      iconDir: 'src/icons',
    }),
  ],
  build: {
    /*
     * Astro's per-page scoped-style bundles are a few KB each, and as separate
     * <link>s they were two extra render-blocking round trips on top of
     * global.css - which BaseLayout links as a static asset on purpose and
     * which therefore cannot be inlined. Inlining the scoped bundles puts the
     * home page's critical CSS in the first response instead of the third.
     */
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      cssMinify: true,
      minify: 'esbuild',
    },
  },
});
