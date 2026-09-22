import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The editor is opened on a phone, often on mobile data, by someone who is not
 * going to wait. The heavy half of the bundle is the rich-text editor, and it
 * is needed only on the screens that have a body to edit - so it is split out
 * and fetched when one of those opens, rather than before the landing screen
 * can paint.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](@tiptap|prosemirror-|orderedmap)/.test(id)) return 'editor';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
  server: { port: 5175 },
});
