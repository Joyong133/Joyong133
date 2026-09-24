import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base './' so the build works on GitHub Pages under /<repo>/
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        nihongo: resolve(__dirname, 'nihongo/index.html'),
      },
    },
  },
  server: {
    host: true,
  },
});
