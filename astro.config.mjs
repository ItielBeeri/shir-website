// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkBreaks from 'remark-breaks';
import remarkUnderscoreItalic from './scripts/remark-underscore-italic.mjs';
import remarkBlankLines from './scripts/remark-blank-lines.mjs';
import remarkExternalLinks from './scripts/remark-external-links.mjs';

const site = 'https://www.shir-amitai.com';

export default defineConfig({
  site,
  markdown: {
    remarkPlugins: [remarkBreaks, remarkUnderscoreItalic, remarkBlankLines, [remarkExternalLinks, { site }]],
  },
  integrations: [
    mdx(),
    sitemap(),
    icon({
      iconDir: 'src/icons',
    }),
  ],
  build: {
    /* Scoped-style bundles are a few KB each; as <link>s they cost extra
       render-blocking round trips. Inlining puts critical CSS in the first
       response, and keeps it after the global.css BaseLayout inlines. */
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      cssMinify: true,
      minify: 'esbuild',
    },
  },
});
