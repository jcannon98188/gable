import tailwindcss from "@tailwindcss/vite";
import { gable, gableServiceWorker } from "@gablejs/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), gable(), gableServiceWorker()],
  test: { include: ["src/**/*.test.ts"] },
});
