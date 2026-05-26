// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

export default defineConfig({
  site: 'https://shir-amitai.com',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/design'),
    }),
    icon({
      iconDir: 'src/icons',
    }),
  ],
});
