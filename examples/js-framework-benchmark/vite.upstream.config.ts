import { defineConfig } from 'vite';

// The build the upstream benchmark expects: one classic script, dist/main.js, loaded by upstream/index.html.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-upstream',
    lib: { entry: 'src/main.ts', formats: ['iife'], name: 'GableKeyed', fileName: () => 'main.js' },
  },
});
