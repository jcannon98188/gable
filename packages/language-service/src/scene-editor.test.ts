import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installPlugin, Server } from "../test-support/tsserver.js";

// Completions for scene tags, properties (dotted axes included) and events in scene templates,
// through a real tsserver with the plugin loaded (TASK-105.7).

const fixtureDir = fileURLToPath(new URL("../fixtures/scene-editor", import.meta.url));
const file = path.join(fixtureDir, "src", "scene.ts").replace(/\\/g, "/");
const disk = readFileSync(file, "utf8");

let probe: string;
let server: Server;

beforeAll(async () => {
  probe = mkdtempSync(path.join(tmpdir(), "gable-scene-plugin-"));
  await installPlugin(probe);
  server = new Server(["--pluginProbeLocations", probe]);
  await server.request("configure", { hostInfo: "test" });
  await server.request("open", { file, projectRootPath: fixtureDir });
}, 120_000);

afterAll(() => {
  server?.stop();
  rmSync(probe, { recursive: true, force: true });
});

/** Replaces the placeholder text `placeholder` with `insert`, completes at its end and restores the buffer. */
async function completeAfter(placeholder: string, insert: string): Promise<string[]> {
  const at = disk.indexOf(placeholder);
  expect(at, placeholder).toBeGreaterThanOrEqual(0);
  const before = disk.slice(0, at).split("\n");
  const line = before.length;
  const offset = before[before.length - 1]!.length + 1;
  await server.request("change", { file, line, offset, endLine: line, endOffset: offset + placeholder.length, insertString: insert });
  try {
    // tsserver answers "No content available" when nothing completes there.
    const info = await server.request("completionInfo", { file, line, offset: offset + insert.length }).catch(() => ({ entries: [] }));
    return info.entries.map((e: any) => e.name) as string[];
  } finally {
    await server.request("change", { file, line, offset, endLine: line, endOffset: offset + insert.length, insertString: placeholder });
  }
}

describe.each([
  ["a renderer boundary's own template", "boundary-start"],
  ["a component marked with elements: pixiElements", "marked-start"],
  ["children projected into a boundary component", "projected-start"],
])("scene completions in %s", (_name, placeholder) => {
  it("offers the scene tags after <", async () => {
    const names = await completeAfter(placeholder, "<sp");
    expect(names).toEqual(expect.arrayContaining(["sprite", "container", "bitmap-text", "tiling-sprite", "nine-slice-sprite", "graphics", "text"]));
    expect(names).not.toContain("div");
  });

  it("offers a tag's properties, with the x and y axes of point properties", async () => {
    const names = await completeAfter(placeholder, "<sprite al");
    expect(names).toEqual(expect.arrayContaining(["alpha", "anchor", "anchor.x", "anchor.y", "texture", "zIndex"]));
    expect(names).not.toContain("fontSize");
    expect(names).not.toContain("alpha.x");
  });

  it("offers properties inside [ ] and the dotted axes", async () => {
    expect(await completeAfter(placeholder, "<container [sc")).toEqual(expect.arrayContaining(["scale", "scale.x", "scale.y"]));
  });

  it("offers the scene events inside ( )", async () => {
    const names = await completeAfter(placeholder, "<container (poi");
    expect(names).toEqual(expect.arrayContaining(["pointerdown", "pointertap", "wheel"]));
    expect(names).not.toContain("fontSize");
  });

  it("offers text properties only on text tags", async () => {
    expect(await completeAfter(placeholder, "<text ")).toEqual(expect.arrayContaining(["fontSize", "fill"]));
  });
});

describe("DOM templates keep their own completions", () => {
  it("does not offer scene tags in a DOM template", async () => {
    const names = await completeAfter("dom-start", "<sp");
    expect(names).not.toContain("sprite");
  });

  it("does not offer scene properties on a DOM element", async () => {
    const names = await completeAfter("dom-start", "<div ");
    expect(names).not.toContain("alpha");
  });
});
