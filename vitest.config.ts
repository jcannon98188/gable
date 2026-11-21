import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}`, import.meta.url));

// Workspace packages resolve from source, so tests never need a prior build.
// Each alias mirrors an entry in the package's exports map.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@gablejs\/core$/, replacement: src("core/src/index.ts") },
      { find: /^@gablejs\/core\/renderer$/, replacement: src("core/src/renderer.ts") },
      { find: /^@gablejs\/core\/rxjs$/, replacement: src("core/src/rxjs.ts") },
      { find: /^@gablejs\/core\/http$/, replacement: src("core/src/http.ts") },
      { find: /^@gablejs\/core\/forms$/, replacement: src("core/src/forms.ts") },
      { find: /^@gablejs\/core\/i18n$/, replacement: src("core/src/i18n.ts") },
      { find: /^@gablejs\/core\/router$/, replacement: src("core/src/router.ts") },
      { find: /^@gablejs\/core\/tooling$/, replacement: src("core/src/tooling.ts") },
      { find: /^@gablejs\/core\/hmr$/, replacement: src("core/src/hmr.ts") },
      { find: /^@gablejs\/core\/devtools$/, replacement: src("core/src/devtools.ts") },
      { find: /^@gablejs\/core\/designer$/, replacement: src("core/src/designer.ts") },
      { find: /^@gablejs\/core\/internal$/, replacement: src("core/src/internal.ts") },
      { find: /^@gablejs\/testing$/, replacement: src("testing/src/index.ts") },
      { find: /^@gablejs\/testing\/renderer$/, replacement: src("testing/src/renderer.ts") },
      { find: /^@gablejs\/testing\/a11y$/, replacement: src("testing/src/a11y.ts") },
      { find: /^@gablejs\/ui-primitives$/, replacement: src("ui-primitives/src/index.ts") },
      { find: /^@gablejs\/ui-primitives\/testing$/, replacement: src("ui-primitives/src/testing.ts") },
      { find: /^@gablejs\/ui$/, replacement: src("ui/src/index.ts") },
      { find: /^@gablejs\/store$/, replacement: src("store/src/index.ts") },
      { find: /^@gablejs\/service-worker$/, replacement: src("service-worker/src/index.ts") },
      { find: /^@gablejs\/service-worker\/core$/, replacement: src("service-worker/src/core/index.ts") },
      { find: /^@gablejs\/service-worker\/runtime$/, replacement: src("service-worker/src/runtime/index.ts") },
      { find: /^@gablejs\/editor$/, replacement: src("editor/src/index.ts") },
      { find: /^@gablejs\/renderer-dom$/, replacement: src("renderer-dom/src/index.ts") },
      { find: /^@gablejs\/renderer-pixi$/, replacement: src("renderer-pixi/src/index.ts") },
      { find: /^@gablejs\/renderer-pixi\/elements$/, replacement: src("renderer-pixi/src/elements.ts") },
      { find: /^@gablejs\/renderer-pixi\/testing$/, replacement: src("renderer-pixi/src/testing.ts") },
      { find: /^@gablejs\/template-format$/, replacement: src("template-format/src/index.ts") },
      { find: /^@gablejs\/prettier-plugin$/, replacement: src("prettier-plugin/src/index.ts") },
    ],
  },
  test: { testTimeout: 30000, hookTimeout: 30000, include: ["packages/*/src/**/*.test.ts"] },
});
