import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build, createServer, type InlineConfig, type Rollup } from "vite";
import { describe, expect, it } from "vitest";
import { describeFamily, gableAssetFamilies } from "./asset-families.js";
import { here } from "./test-server.js";

/** A scratch copy of the asset example app and the Vite config that serves or builds it. */
function assetApp(extra: InlineConfig = {}) {
  const scratch = here("../.scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "assets-"));
  cpSync(here("../fixtures/assets-app"), root, { recursive: true });
  const config: InlineConfig = { root, configFile: false, logLevel: "silent", plugins: [gableAssetFamilies()], server: { port: 0 }, ...extra };
  return { root, config, remove: () => rmSync(root, { recursive: true, force: true, maxRetries: 5 }) };
}

async function buildApp(extra: InlineConfig = {}) {
  const app = assetApp({ build: { write: false, minify: false, assetsInlineLimit: 0 }, ...extra });
  try {
    const out = (await build(app.config)) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const output = (Array.isArray(out) ? out[0]! : out).output;
    const assets = new Map(output.flatMap((o) => (o.type === "asset" ? [[o.fileName, o] as const] : [])));
    const main = output.find((o): o is Rollup.OutputChunk => o.type === "chunk")!;
    return { assets, main };
  } finally {
    app.remove();
  }
}

const text = (a: Rollup.OutputAsset) => (typeof a.source === "string" ? a.source : Buffer.from(a.source).toString("utf8"));

describe("describeFamily", () => {
  it("finds a spritesheet's image and further packs, and rewrites them", () => {
    const f = describeFamily("a.json", JSON.stringify({ frames: {}, meta: { image: "a.png", related_multi_packs: ["b.json"] } }))!;
    expect(f.refs).toEqual(["a.png", "b.json"]);
    expect(JSON.parse(f.rewrite((r) => `x-${r}`)).meta).toEqual({ image: "x-a.png", related_multi_packs: ["x-b.json"] });
  });
  it("finds every page of a bitmap font in text and XML form", () => {
    const f = describeFamily("f.fnt", 'page id=0 file="f_0.png"\npage id=1 file="f_1.png"\n')!;
    expect(f.refs).toEqual(["f_0.png", "f_1.png"]);
    expect(f.rewrite((r) => `h-${r}`)).toContain('file="h-f_1.png"');
    expect(describeFamily("f.xml", '<font><pages><page id="0" file="f_0.png"/></pages></font>')!.refs).toEqual(["f_0.png"]);
  });
  it("ignores JSON that is not a spritesheet", () => {
    expect(describeFamily("x.json", '{"a":1}')).toBeNull();
    expect(describeFamily("x.json", "not json")).toBeNull();
  });
});

describe("production build", () => {
  it("hashes the siblings and rewrites the descriptors to the hashed names", { timeout: 60_000 }, async () => {
    const { assets, main } = await buildApp();
    const names = [...assets.keys()];
    const sheet = names.find((n) => /hero-[\w-]+\.json$/.test(n))!;
    const font = names.find((n) => /pixel-[\w-]+\.fnt$/.test(n))!;
    expect(sheet && font).toBeTruthy();

    const image = JSON.parse(text(assets.get(sheet)!)).meta.image as string;
    expect(image).toMatch(/^hero-[\w-]+\.png$/); // hashed, no longer "hero.png"
    expect(names).toContain(`assets/${image}`); // and it is really in the output, beside the descriptor
    expect(text(assets.get(sheet)!)).toContain("hero/idle_0"); // the rest of the descriptor is untouched

    const page = /file="([^"]+)"/.exec(text(assets.get(font)!))![1]!;
    expect(page).toMatch(/^pixel_0-[\w-]+\.png$/);
    expect(names).toContain(`assets/${page}`);

    // The manifest entries are the descriptor URLs, next to a plain hashed import.
    expect(main.code).toContain(sheet);
    expect(main.code).toContain(font);
    expect(main.code).toMatch(/assets\/ship-[\w-]+\.png/);
    expect(names).not.toContain("assets/hero.png");

    // Pixi resolves a descriptor's sibling against the descriptor's own URL; that lands on an emitted file.
    const resolved = new URL(image, new URL(/"([^"]*hero-[\w-]+\.json)"/.exec(main.code)![1]!, "http://host/")).pathname.slice(1);
    expect(names).toContain(resolved);
  });

  it("follows `base` for the exported URL", { timeout: 60_000 }, async () => {
    const { main } = await buildApp({ base: "/cdn/" });
    expect(main.code).toMatch(/"\/cdn\/assets\/hero-[\w-]+\.json"/);
  });

  it("changes the descriptor's hash when a sibling changes", { timeout: 60_000 }, async () => {
    const a = await buildApp();
    const app = assetApp({ build: { write: false, minify: false, assetsInlineLimit: 0 } });
    try {
      cpSync(join(app.root, "src/art/ship.png"), join(app.root, "src/art/hero.png"), { force: true });
      const out = (await build(app.config)) as Rollup.RollupOutput;
      const names = out.output.map((o) => o.fileName);
      const before = [...a.assets.keys()].find((n) => /hero-[\w-]+\.json$/.test(n));
      expect(names.find((n) => /hero-[\w-]+\.json$/.test(n))).not.toBe(before);
    } finally {
      app.remove();
    }
  });
});

describe("dev server", () => {
  it("serves the descriptor and its unmoved siblings", { timeout: 60_000 }, async () => {
    const app = assetApp();
    const server = await createServer(app.config);
    try {
      await server.listen();
      const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
      const mod = (await server.transformRequest("/src/main.ts"))!.code;
      const sheetUrl = /\/src\/art\/hero\.json/.exec(mod)![0];
      const sheet = await fetch(origin + sheetUrl);
      expect(sheet.status).toBe(200);
      const meta = ((await sheet.json()) as { meta: { image: string } }).meta;
      expect(meta.image).toBe("hero.png"); // dev rewrites nothing
      expect((await fetch(`${origin}/src/art/${meta.image}`)).status).toBe(200); // the relative lookup resolves
      expect((await fetch(`${origin}/src/art/pixel.fnt`)).status).toBe(200);
      expect((await fetch(`${origin}/src/art/pixel_0.png`)).status).toBe(200);
    } finally {
      await server.close();
      app.remove();
    }
  });
});
