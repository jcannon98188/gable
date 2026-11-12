import { gable } from "@gable/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [gable()], server: { fs: { strict: false } } });
