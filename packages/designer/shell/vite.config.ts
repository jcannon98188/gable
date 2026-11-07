import { gable } from "@gable/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The shell's own build. Its Tailwind and theme live here; the previewed project has its own, inside the iframe.
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [tailwindcss(), gable()],
  build: { outDir: "../dist/shell", emptyOutDir: true },
  server: { port: 5190 },
});
