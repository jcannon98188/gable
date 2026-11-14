// ADR 0021: the runtime (the default worker) uses only core's public surface, so a primitive the runtime needs that
// core does not export is a gap in core. This test enforces it on every non-test source file under src/runtime.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runtimeBoundaryViolations } from "./testing/boundary.js";

describe("runtime boundary checker", () => {
  const check = (source: string, file = "runtime/worker.ts") => runtimeBoundaryViolations([{ file, source }]);

  it("allows core's public entry, by package name or relative path, and runtime's own modules", () => {
    const source = [
      `import { route } from "@gable/service-worker/core";`,
      `import type { WorkerScope } from "../core/index.js";`,
      `export { config } from "./config.js";`,
      `import "./polyfill.js";`,
      `const lazy = () => import("./lazy.js");`,
    ].join("\n");
    expect(check(source)).toEqual([]);
  });

  it("allows core's entry from a nested runtime module", () => {
    expect(check(`import { x } from "../../core/index.js";`, "runtime/strategies/table.ts")).toEqual([]);
  });

  it("allows packages outside @gable/service-worker", () => {
    expect(check(`import { signal } from "@gable/core";\nimport x from "some-lib";`)).toEqual([]);
  });

  it("rejects core internals, whatever the import form", () => {
    const source = [
      `import { matchRoute } from "../core/routing.js";`,
      `import type { Scope } from "../core/scope.js";`,
      `export * from "../core/precache.js";`,
      `import "../core/side-effect.js";`,
      `const m = await import("../core/lazy.js");`,
    ].join("\n");
    expect(check(source).map((v) => v.specifier)).toEqual([
      "../core/routing.js",
      "../core/scope.js",
      "../core/precache.js",
      "../core/side-effect.js",
      "../core/lazy.js",
    ]);
  });

  it("rejects the app side and other package subpaths", () => {
    const source = [
      `import { x } from "../index.js";`,
      `import { y } from "@gable/service-worker";`,
      `import { z } from "@gable/service-worker/core/routing";`,
      `import { w } from "../testing/worker-scope.js";`,
    ].join("\n");
    expect(check(source)).toEqual([
      { file: "runtime/worker.ts", specifier: "../index.js" },
      { file: "runtime/worker.ts", specifier: "@gable/service-worker" },
      { file: "runtime/worker.ts", specifier: "@gable/service-worker/core/routing" },
      { file: "runtime/worker.ts", specifier: "../testing/worker-scope.js" },
    ]);
  });

  it("handles multi-line imports", () => {
    expect(check(`import {\n  a,\n  b,\n} from "../core/internal.js";`).map((v) => v.specifier)).toEqual(["../core/internal.js"]);
  });
});

describe("runtime boundary", () => {
  it("runtime imports only core's public exports", () => {
    const src = fileURLToPath(new URL(".", import.meta.url));
    const files = readdirSync(join(src, "runtime"), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `runtime/${f.split("\\").join("/")}`);
    expect(files).toContain("runtime/index.ts");
    const sources = files.map((file) => ({ file, source: readFileSync(join(src, file), "utf8") }));
    expect(runtimeBoundaryViolations(sources)).toEqual([]);
  });
});
