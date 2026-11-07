import tailwindcss from "@tailwindcss/vite";
import { gable } from "@gable/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [gable(), tailwindcss()] });
