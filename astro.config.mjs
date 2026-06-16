// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://shir-amitai.com',
  integrations: [
    mdx(),
    icon({
      iconDir: 'src/icons',
    }),
  ],
  vite: {
    build: {
      cssMinify: true,
      minify: 'esbuild',
    },
  },
});
