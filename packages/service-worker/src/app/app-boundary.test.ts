// The app side (the package's root entry) runs in the page; the runtime is the default worker. The page must never
// pull worker code in, so nothing under src/app, nor src/index.ts, imports from the runtime.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("..", import.meta.url));
const specifiers = (source: string) => [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

describe("app-side boundary", () => {
  it("the root entry and the app services never import the runtime", () => {
    const files = [
      "index.ts",
      ...readdirSync(join(src, "app"))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => `app/${f}`),
    ];
    expect(files).toContain("app/registration.ts");
    const offenders = files.flatMap((file) =>
      specifiers(readFileSync(join(src, file), "utf8"))
        .filter((s) => /(^|\/)runtime(\/|$|\.)/.test(s) || s.startsWith("@gablejs/service-worker/runtime"))
        .map((s) => `${file}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
