import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(`../../packages/${p}`, import.meta.url));

// Workspace packages resolve from source (the same aliases as the root vitest.config.ts), so no pack step is needed.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@gablejs\/core$/, replacement: src('core/src/index.ts') },
      { find: /^@gablejs\/core\/renderer$/, replacement: src('core/src/renderer.ts') },
      { find: /^@gablejs\/core\/internal$/, replacement: src('core/src/internal.ts') },
      { find: /^@gablejs\/ui-primitives$/, replacement: src('ui-primitives/src/index.ts') },
      { find: /^@gablejs\/renderer-dom$/, replacement: src('renderer-dom/src/index.ts') },
    ],
  },
  server: { fs: { allow: ['../..'] } },
});
