import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The real gable-ui source tree (packages/ui). */
export const uiDir = fileURLToPath(new URL("../../ui", import.meta.url));

export function tempDir(prefix = "gable-ui-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Writes `files` (path to text) under `dir`. */
export function writeTree(dir: string, files: Record<string, string>): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** A tiny gable-ui source tree: button needs variants and clsx, dialog needs button, cn and @gable/core. */
export const MINI_UI: Record<string, string> = {
  "package.json": JSON.stringify({ name: "@gable/ui", dependencies: { "@gable/core": "0.0.0", clsx: "^2.1.1", "tailwind-merge": "^3.7.0" } }),
  "theme.css": `/* header\n * import me */\n:root {\n  --background: white;\n}\n`,
  "src/lib/cn.ts": `import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\nexport const cn = (...i: unknown[]) => twMerge(clsx(i));\n`,
  "src/lib/variants.ts": `import { cn } from "./cn.js";\nexport const variants = () => cn("a");\n`,
  "src/components/button.ts": `/**\n * A button.\n *\n * More.\n */\nimport { input } from "@gable/core";\nimport { variants } from "../lib/variants.js";\n// import { nope } from "not-a-dep";\nexport const b = variants() + String(input);\n`,
  "src/components/button.test.ts": `import "vitest";\n`,
  "src/components/dialog.ts": `import { cn } from "../lib/cn.js";\nimport { b } from "./button.js";\nimport type { X } from "@gable/core/hmr";\nexport const d = cn(b);\n`,
};
