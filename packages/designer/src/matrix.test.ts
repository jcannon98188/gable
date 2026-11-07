// The Scenario by breakpoint matrix (TASK-56.22): the PNG codec and pixel diff, the markup printer, the store (renders through
// a fake renderer, baselines on disk, statuses, detail), the panel's helpers, and the MCP tools over an in-memory client with a
// fake Designer window. The real headless render is covered by e2e/matrix-check.mjs.
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, describe, expect, it } from "vitest";

import { cellText, parseWidths } from "../shell/src/app/matrix-state.js";
import type { ControlRequest } from "./control-protocol.js";
import { DEFAULT_BREAKPOINTS, MAX_MATRIX_CELLS, cellId, matrixProblem, sanitizeBreakpoints, type MatrixCommand, type MatrixCommandResult } from "./matrix.js";
import { runMatrixCommand } from "./server/matrix-api.js";
import { MatrixStore, type Capture } from "./server/matrix.js";
import { ShellBridge } from "./server/mcp/bridge.js";
import { createControlServer } from "./server/mcp/control.js";
import { decodePng, diffImages, encodePng, prettyMarkup, type Raster } from "./server/png.js";
import { EditService } from "./server/edit/service.js";
import { TailwindService } from "./server/tailwind/api.js";
import { checkProject } from "./server/projects.js";

const FIXTURE = fileURLToPath(new URL("../test-fixtures/matrix-app", import.meta.url));
const made: string[] = [];
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), "gable-matrix-test-"));
  made.push(d);
  return d;
};
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const solid = (w: number, h: number, rgb: [number, number, number], patch?: (x: number, y: number) => [number, number, number] | null): Raster => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = patch?.(x, y) ?? rgb;
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
};

describe("png", () => {
  it("round-trips RGBA through encode and decode", () => {
    const r = solid(7, 5, [10, 200, 30], (x, y) => (x === 3 && y === 2 ? [255, 0, 0] : null));
    const back = decodePng(encodePng(r));
    expect([back.width, back.height]).toEqual([7, 5]);
    expect(Array.from(back.data)).toEqual(Array.from(r.data));
  });

  it("refuses what is not a PNG", () => {
    expect(() => decodePng(Buffer.from("nope"))).toThrow(/Not a PNG/);
  });

  it("counts changed pixels, boxes them, and paints them red", () => {
    const a = solid(10, 10, [255, 255, 255]);
    const b = solid(10, 10, [255, 255, 255], (x, y) => (x >= 2 && x <= 4 && y >= 5 && y <= 6 ? [0, 0, 0] : null));
    const d = diffImages(a, b);
    expect(d.changedPixels).toBe(6);
    expect(d.box).toEqual({ x: 2, y: 5, width: 3, height: 2 });
    expect(d.ratio).toBeCloseTo(0.06);
    expect(d.sizeChanged).toBe(false);
    const out = decodePng(d.png);
    expect(Array.from(out.data.subarray((5 * 10 + 2) * 4, (5 * 10 + 2) * 4 + 3))).toEqual([220, 38, 38]);
  });

  it("ignores differences within the tolerance and counts a size change as changed area", () => {
    const a = solid(4, 4, [100, 100, 100]);
    expect(diffImages(a, solid(4, 4, [101, 102, 100])).changedPixels).toBe(0);
    const grown = diffImages(a, solid(4, 6, [100, 100, 100]));
    expect(grown.sizeChanged).toBe(true);
    expect(grown.changedPixels).toBe(8);
  });
});

describe("markup printing", () => {
  it("prints one tag or text run per line, indented, without comments or blank text", () => {
    const out = prettyMarkup('<section class="card"><!--x--><h2>Pro</h2>\n  <img src="a.png"><ul><li>One</li></ul></section>');
    expect(out).toBe(['<section class="card">', "  <h2>", "    Pro", "  </h2>", '  <img src="a.png">', "  <ul>", "    <li>", "      One", "    </li>", "  </ul>", "</section>", ""].join("\n"));
  });
});

describe("breakpoints and caps", () => {
  it("sanitises widths: sorted, unique, in range, named", () => {
    expect(sanitizeBreakpoints([{ width: 1024 }, { width: 375, name: " phone " }, { width: 375 }, { width: 50 }, { width: "x" }, null])).toEqual([
      { name: "phone", width: 375 },
      { name: "1024", width: 1024 },
    ]);
    expect(sanitizeBreakpoints(undefined)).toEqual(DEFAULT_BREAKPOINTS);
  });

  it("refuses an empty or oversized grid with the reason", () => {
    expect(matrixProblem(0, 3)).toMatch(/no scenes/);
    expect(matrixProblem(2, 0)).toMatch(/at least one breakpoint/);
    expect(matrixProblem(2, 7)).toMatch(/At most 6/);
    expect(matrixProblem(MAX_MATRIX_CELLS, 2)).toMatch(/the most is 48/);
    expect(matrixProblem(2, 4)).toBeNull();
  });

  it("parses the widths field the panel offers", () => {
    expect(parseWidths("768, 375 700px; 99 ; 375")).toEqual([
      { name: "phone", width: 375 },
      { name: "700", width: 700 },
      { name: "md", width: 768 },
    ]);
  });
});

// --- the store with a fake renderer ----------------------------------------------------------------------------------

/** What the fake page looks like now; a test changes it between runs. */
const world = { shade: 255, hidden: "a", failing: new Set<string>() };

function makeStore(dir = scratch()) {
  const renders: string[] = [];
  const store = new MatrixStore({
    root: FIXTURE,
    dataDir: dir,
    previewUrl: () => "http://localhost:1/",
    browser: () => "fake-browser.exe",
    renderer: () => ({
      async start() {},
      close() {},
      async render({ url, width, height }): Promise<Capture> {
        const q = new URL(url).searchParams;
        const scene = q.get("scene")!;
        renders.push(`${scene}@${width}`);
        if (world.failing.has(scene)) throw new Error("Boom: the scene threw");
        const png = encodePng(solid(width, 40, [world.shade, 255, 255], (x) => (scene === "Pro" && x < 5 ? [0, 0, 0] : null)));
        return { png, markup: prettyMarkup(`<section data-x="${world.hidden}"><h2>${scene}</h2></section>`), contentHeight: height + (width < 500 ? 300 : 0), console: [] };
      },
    }),
  });
  return { store, renders, dir };
}

describe("the matrix store", () => {
  it("renders every scene at every breakpoint, with no baselines to compare to", async () => {
    world.shade = 255;
    world.hidden = "a";
    world.failing.clear();
    const { store, renders } = makeStore();
    const run = await store.runMatrix({ breakpoints: [{ name: "phone", width: 375 }, { name: "lg", width: 1024 }] });
    expect(run.rows.map((r) => r.scene)).toEqual(["Starter", "Pro"]);
    expect(run.rows[0]).toMatchObject({ file: "/src/pricing-card.scenes.ts", component: "PricingCard", description: "The default plan" });
    expect(run.cells.map((c) => `${c.scene}@${c.width}:${c.status}`)).toEqual(["Starter@375:new", "Starter@1024:new", "Pro@375:new", "Pro@1024:new"]);
    expect(renders).toHaveLength(4);
    expect(run.counts).toMatchObject({ total: 4, new: 4, withBaseline: 0 });
    expect(run.cells[0]!.image).toMatch(/^data:image\/png;base64,/);
    expect(run.cells[0]!.contentHeight).toBe(1020);
  });

  it("saves what the run showed, then reports same, changed (with the box) and markup-only changes", async () => {
    world.shade = 255;
    world.hidden = "a";
    const { store, dir } = makeStore();
    const bps = [{ name: "phone", width: 375 }];
    await store.runMatrix({ breakpoints: bps });
    expect(store.saveBaselines("all")).toBe(2);
    expect(readdirSync(join(dir, "matrix", readdirSync(join(dir, "matrix"))[0]!)).filter((f) => f.endsWith(".png"))).toHaveLength(2);

    expect((await store.runMatrix({ breakpoints: bps })).counts).toMatchObject({ same: 2, changed: 0, withBaseline: 2 });

    world.hidden = "b";
    const markup = await store.runMatrix({ breakpoints: bps });
    expect(markup.cells.map((c) => c.status)).toEqual(["markup", "markup"]);
    const detail = store.detail({ file: "/src/pricing-card.scenes.ts", scene: "Starter", width: 375 });
    expect(detail.markupDiff).toContain('-<section data-x="a">');
    expect(detail.markupDiff).toContain('+<section data-x="b">');
    expect(detail.diff).toMatch(/^data:image\/png/);

    world.hidden = "a";
    world.shade = 200;
    const changed = await store.runMatrix({ breakpoints: bps });
    expect(changed.cells.map((c) => c.status)).toEqual(["changed", "changed"]);
    const starter = changed.cells[0]!;
    expect(starter.changedPixels).toBe(375 * 40);
    expect(starter.box).toEqual({ x: 0, y: 0, width: 375, height: 40 });

    // Saving the changed cells makes them the baseline: the status follows without another render.
    expect(store.saveBaselines("changed")).toBe(2);
    expect(store.run!.cells.map((c) => c.status)).toEqual(["same", "same"]);
    expect(store.run!.counts.withBaseline).toBe(2);
  });

  it("forgets baselines, and refuses to save before a run or from a cell that failed", async () => {
    world.shade = 255;
    world.failing.clear();
    const { store } = makeStore();
    expect(() => store.saveBaselines("all")).toThrow(/Run the matrix first/);
    world.failing.add("Pro");
    const run = await store.runMatrix({ breakpoints: [{ name: "x", width: 400 }] });
    expect(run.cells.map((c) => c.status)).toEqual(["new", "error"]);
    expect(run.cells[1]!.error).toMatch(/Boom/);
    expect(() => store.saveBaselines([{ file: "/src/pricing-card.scenes.ts", scene: "Pro", width: 400 }])).toThrow(/did not render/);
    expect(() => store.saveBaselines([{ file: "/src/pricing-card.scenes.ts", scene: "Nope", width: 400 }])).toThrow(/Not in the last run/);
    expect(store.saveBaselines("all")).toBe(1);
    expect(store.forget("all")).toBe(1);
    expect(store.run!.cells[0]!.status).toBe("new");
    expect(store.baselines()).toEqual([]);
    world.failing.clear();
  });

  it("narrows by scene, caps the grid, and says when nothing can render", async () => {
    const { store, renders } = makeStore();
    const run = await store.runMatrix({ scenes: ["Pro"], breakpoints: [{ name: "a", width: 500 }] });
    expect(run.cells.map((c) => c.scene)).toEqual(["Pro"]);
    expect(renders).toEqual(["Pro@500"]);
    await expect(store.runMatrix({ scenes: ["Missing"] })).rejects.toThrow(/no scenes/);
    await expect(store.runMatrix({ breakpoints: [] })).rejects.toThrow(/at least one breakpoint/);
    const none = new MatrixStore({ root: FIXTURE, dataDir: scratch(), previewUrl: () => null });
    await expect(none.runMatrix()).rejects.toThrow(/dev server is not running/);
    const noBrowser = new MatrixStore({ root: FIXTURE, dataDir: scratch(), previewUrl: () => "http://x/", browser: () => null });
    await expect(noBrowser.runMatrix()).rejects.toThrow(/headless browser.*GABLE_CHROME/);
  });

  it("answers the API's commands", async () => {
    world.shade = 255;
    world.hidden = "a";
    const { store } = makeStore();
    const cmd = (c: MatrixCommand): Promise<MatrixCommandResult> => runMatrixCommand(store, c);
    expect((await cmd({ action: "report" })).run).toBeNull();
    await cmd({ action: "run", request: { breakpoints: [{ name: "phone", width: 375 }] } });
    expect((await cmd({ action: "baseline", which: "changed" })).saved).toBe(2);
    const key = { file: "/src/pricing-card.scenes.ts", scene: "Pro", width: 375 };
    const d = (await cmd({ action: "detail", cell: key })).detail!;
    expect(cellId(d.cell)).toBe("/src/pricing-card.scenes.ts|Pro|375");
    expect(d.baseline).toBe(d.current);
    expect(d.markupDiff).toBe("");
    expect((await cmd({ action: "forget", which: [key] })).saved).toBe(1);
  });
});

describe("the panel's words", () => {
  it("says what each cell is", () => {
    expect(cellText({ scene: "Pro", width: 375, status: "changed", changedRatio: 0.01234 })).toBe("Pro at 375px: 1.23% of pixels changed");
    expect(cellText({ scene: "Pro", width: 375, status: "markup" })).toMatch(/same pixels, different markup/);
    expect(cellText({ scene: "Pro", width: 375, status: "error", error: "boom" })).toMatch(/did not render \(boom\)/);
    expect(cellText({ scene: "Pro", width: 375, status: "new" })).toMatch(/no baseline/);
    expect(cellText({ scene: "Pro", width: 375, status: "same" })).toMatch(/matches/);
  });
});

// --- the MCP tools -----------------------------------------------------------------------------------------------------

const textOf = (r: CallToolResult) => (r.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");

describe("mcp: matrix tools", () => {
  async function setup() {
    world.shade = 255;
    world.hidden = "a";
    world.failing.clear();
    const { store } = makeStore();
    const bridge = new ShellBridge();
    bridge.shellUrl = "http://127.0.0.1:9/";
    const received: ControlRequest[] = [];
    // The window forwards `matrix` to the backend, as the shell does over /api/matrix; `open` also sends back the cell's detail.
    bridge.connect((r) => {
      received.push(r);
      queueMicrotask(async () => {
        try {
          const c = r.params as MatrixCommand;
          const result = await runMatrixCommand(store, c.action === "open" ? { action: "detail", cell: c.cell } : c);
          bridge.reply({ id: r.id, ok: true, result });
        } catch (e) {
          bridge.reply({ id: r.id, ok: false, error: (e as Error).message });
        }
      });
    });
    const server = createControlServer({
      root: FIXTURE,
      info: { root: FIXTURE, name: "matrix", previewUrl: "http://localhost:1", ready: true, error: null, server: "running", installing: false, check: checkProject(FIXTURE) },
      edits: new EditService(FIXTURE),
      tailwind: new TailwindService(FIXTURE),
      bridge,
      diagnostics: async () => ({ at: 0, configErrors: [], diagnostics: [] }),
      historyChanged: () => undefined,
      cdpPort: null,
      shellOrigins: () => [],
      browser: null,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
    return { client, call, received };
  }
  const json = (r: CallToolResult) => {
    if (r.isError) throw new Error(textOf(r));
    return JSON.parse(textOf(r)) as Record<string, any>;
  };

  it("lists the tools", async () => {
    const m = await setup();
    const names = (await m.client.listTools()).tools.map((t) => t.name);
    for (const n of ["get_matrix", "run_matrix", "get_matrix_cell", "save_matrix_baselines", "forget_matrix_baselines"]) expect(names).toContain(n);
  });

  it("runs, saves baselines, and shows a changed cell as images with the markup diff", async () => {
    const m = await setup();
    expect(json(await m.call("get_matrix")).note).toMatch(/has not been run/);
    const run = json(await m.call("run_matrix", { breakpoints: [{ width: 375 }, { width: 768 }] }));
    expect(run.counts).toMatchObject({ total: 4, new: 4 });
    expect(run.scenes[0].cells[0]).toMatchObject({ file: "/src/pricing-card.scenes.ts", scene: "Starter", width: 375, status: "new" });
    expect(JSON.stringify(run)).not.toContain("data:image");
    expect(json(await m.call("save_matrix_baselines", { cells: "all" })).saved).toBe(4);

    world.shade = 128;
    world.hidden = "b";
    const again = json(await m.call("run_matrix", { breakpoints: [{ width: 375 }, { width: 768 }] }));
    expect(again.counts).toMatchObject({ changed: 4, same: 0 });
    expect(again.scenes[0].cells[0]).toMatchObject({ status: "changed", changedPercent: 100 });

    const cell = await m.call("get_matrix_cell", { cell: { file: "/src/pricing-card.scenes.ts", scene: "Starter", width: 375 } });
    const content = cell.content as Array<{ type: string; text?: string }>;
    expect(content.filter((c) => c.type === "image")).toHaveLength(3);
    expect(textOf(cell)).toContain('+<section data-x=\\"b\\">');
    expect(m.received.at(-1)).toMatchObject({ name: "matrix", params: { action: "open" } });
    expect((await m.call("get_matrix_cell", { cell: { file: "/src/pricing-card.scenes.ts", scene: "Starter", width: 375 }, images: "diff" })).content.filter((c) => c.type === "image")).toHaveLength(1);

    expect(json(await m.call("forget_matrix_baselines", { cells: [{ file: "/src/pricing-card.scenes.ts", scene: "Pro", width: 768 }] })).saved).toBe(1);
    expect(textOf(await m.call("save_matrix_baselines", { cells: [{ file: "/src/pricing-card.scenes.ts", scene: "Nope", width: 1 }] }))).toMatch(/Not in the last run/);
  });

  it("explains a refused run", async () => {
    const m = await setup();
    const r = await m.call("run_matrix", { scenes: ["Missing"] });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/no scenes/);
  });
});

it("leaves the fixture untouched", () => {
  expect(existsSync(join(FIXTURE, "src", "pricing-card.scenes.ts"))).toBe(true);
});
