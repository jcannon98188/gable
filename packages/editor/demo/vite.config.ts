import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const pkg = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

// Run from the repository root: `npm run demo -w packages/editor`. Workspace packages resolve from source.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: /^@gablejs\/core$/, replacement: pkg("core/src/index.ts") },
      { find: /^@gablejs\/core\/internal$/, replacement: pkg("core/src/internal.ts") },
      { find: /^@gablejs\/renderer-dom$/, replacement: pkg("renderer-dom/src/index.ts") },
      { find: /^@gablejs\/ui-primitives$/, replacement: pkg("ui-primitives/src/index.ts") },
      { find: /^@gablejs\/ui$/, replacement: pkg("ui/src/index.ts") },
      { find: /^@gablejs\/ui\/theme\.css$/, replacement: pkg("ui/theme.css") },
      { find: /^@gablejs\/editor$/, replacement: pkg("editor/src/index.ts") },
    ],
  },
});
