import tailwindcss from "@tailwindcss/vite";
import { gable } from "@gable/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), gable()],
  test: { include: ["src/**/*.test.ts"] },
});
