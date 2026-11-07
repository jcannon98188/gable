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
      { find: /^@gable\/core$/, replacement: pkg("core/src/index.ts") },
      { find: /^@gable\/core\/internal$/, replacement: pkg("core/src/internal.ts") },
      { find: /^@gable\/renderer-dom$/, replacement: pkg("renderer-dom/src/index.ts") },
      { find: /^@gable\/ui-primitives$/, replacement: pkg("ui-primitives/src/index.ts") },
      { find: /^@gable\/ui$/, replacement: pkg("ui/src/index.ts") },
      { find: /^@gable\/ui\/theme\.css$/, replacement: pkg("ui/theme.css") },
      { find: /^@gable\/editor$/, replacement: pkg("editor/src/index.ts") },
    ],
  },
});
