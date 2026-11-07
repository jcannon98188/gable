import { gable } from "@gable/vite";
import { defineConfig } from "vitest/config";

// GitHub Pages serves a project site from /<repo>/, so the deploy workflow sets SITE_BASE=/gable/.
export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  plugins: [
    gable(),
    {
      // gable() turns the dev hooks off for `vite build` (__GABLE_DEV__ false). The live HMR demo runs the real HMR runtime
      // in the built page, which needs them, so this later plugin turns them back on for the site bundle.
      name: "site-keep-dev-hooks",
      config: () => ({ define: { __GABLE_DEV__: "true" } }),
    },
  ],
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
});
