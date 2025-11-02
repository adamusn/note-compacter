import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  server: {
    strictPort: true,
    port: 5174
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
