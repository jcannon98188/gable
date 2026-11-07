import { gable } from "@gable/vite";
import { defineConfig } from "vitest/config";

// GitHub Pages serves a project site from /<repo>/, so the deploy workflow sets SITE_BASE=/gable/.
export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  plugins: [gable()],
  test: { include: ["src/**/*.test.ts"] },
});
