import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as core from "@gable/core";

describe("public API", () => {
  it("does not expose the signal polyfill at runtime or in declarations", () => {
    expect(Object.keys(core)).not.toContain("Signal");

    const pkg = fileURLToPath(new URL("..", import.meta.url));
    const out = mkdtempSync(join(tmpdir(), "gable-dts-"));
    const tsc = fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url));
    execFileSync(process.execPath, [tsc, "-p", join(pkg, "tsconfig.build.json"), "--outDir", out, "--tsBuildInfoFile", join(out, "x.tsbuildinfo")]);
    const dts = readdirSync(out, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".d.ts"));
    expect(dts).toContain("index.d.ts");
    for (const f of dts) {
      expect(readFileSync(join(out, f), "utf8"), f).not.toMatch(/signal-polyfill|Signal\.(State|Computed|subtle)/);
    }
  }, 60_000);
});
