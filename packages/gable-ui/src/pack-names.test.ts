import { describe, expect, it } from "vitest";

// scripts/pack-local.mjs is plain JS outside this package; load it by path so it needs no type declarations.
const script = new URL("../../../scripts/pack-local.mjs", import.meta.url).href;
type Pkg = { name: string; manifest: { version: string } };
const load = () => import(/* @vite-ignore */ script) as Promise<{ vendorNames(p: Pkg[]): Map<string, string>; publishablePackages(): Pkg[] }>;
const pkg = (name: string): Pkg => ({ name, manifest: { version: "1.2.3" } });

describe("pack-local tarball names", () => {
  it("keeps the @gable/ui and gable-ui CLI tarballs distinct", async () => {
    const { vendorNames } = await load();
    const names = vendorNames([pkg("@gable/ui"), pkg("gable-ui"), pkg("@gable/core"), pkg("create-gable")]);
    expect(names.get("@gable/ui")).toBe("gable-ui-1.2.3.tgz");
    expect(names.get("gable-ui")).toBe("gable-ui-cli-1.2.3.tgz");
    expect(names.get("create-gable")).toBe("create-gable-1.2.3.tgz");
    expect(new Set(names.values()).size).toBe(names.size);
  });

  it("gives every package the workspace currently packs its own file", async () => {
    const { vendorNames, publishablePackages } = await load();
    const names = vendorNames(publishablePackages());
    expect(new Set(names.values()).size).toBe(names.size);
  });
});
