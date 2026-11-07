// The Scenario by breakpoint matrix (TASK-56.22), backend half. Every scene of every `*.scenes.ts` file is mounted by the
// component-mode host (the same `mountScene` the Designer's component mode and `@gable/testing` use) in a headless Chromium
// at each breakpoint's width, screenshotted, and compared with the baseline saved for that cell.
//
// Nothing is faked and nothing is written to the project: the pictures come from a real render of the project's own dev
// server (a fresh app instance per cell, no Designer agent, nothing added to the page), and baselines live in the Designer's
// data directory next to the frame layout (`settings.ts`), keyed by project. Saving a baseline stores exactly the picture
// the last run showed, so what you approved is what is compared next time.
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cellId,
  matrixProblem,
  sanitizeBreakpoints,
  MATRIX_HEIGHT,
  type CellKey,
  type CellStatus,
  type MatrixBreakpoint,
  type MatrixCell,
  type MatrixDetail,
  type MatrixRequest,
  type MatrixRun,
} from "../matrix.js";
import { unifiedDiff } from "./edit/diff.js";
import { decodePng, diffImages, prettyMarkup } from "./png.js";
import { sceneIndex } from "./scene-index.js";
import { CdpClient, findBrowser } from "./mcp/screenshot.js";

const SETTLE_MS = 400;
const CELL_TIMEOUT_MS = 20000;

export interface Capture {
  png: Buffer;
  /** The mounted scene's markup, pretty-printed. */
  markup: string;
  contentHeight: number;
  console: string[];
}

export interface RenderTarget {
  url: string;
  width: number;
  height: number;
}

/** One headless browser, one tab, many navigations. */
export class HeadlessRenderer {
  #child: ChildProcess | null = null;
  #cdp: CdpClient | null = null;
  #profile: string | null = null;
  #sessionId = "";
  #events: Array<(method: string, params: unknown) => void> = [];
  readonly browser: string;

  constructor(browser: string) {
    this.browser = browser;
  }

  async start(): Promise<void> {
    const profile = (this.#profile = mkdtempSync(join(tmpdir(), "gable-designer-matrix-")));
    const child = (this.#child = spawn(this.browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true }));
    const failed = new Promise<never>((_, fail) => child.once("error", (e) => fail(new Error(`Could not start ${this.browser}: ${e.message}`))));
    const portFile = join(profile, "DevToolsActivePort");
    const ready = (async () => {
      for (let i = 0; i < 150; i++) {
        if (existsSync(portFile)) {
          const [port, path] = readFileSync(portFile, "utf8").split(/\r?\n/);
          if (port && path) return { port: Number(port), path };
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("The headless browser did not open its debugging port.");
    })();
    const { port, path } = await Promise.race([ready, failed]);
    const cdp = (this.#cdp = await CdpClient.connect(port, path));
    cdp.on((method, params, sid) => {
      if (sid === this.#sessionId) for (const l of this.#events) l(method, params);
    });
    const { targetInfos } = await cdp.send<{ targetInfos: Array<{ targetId: string; type: string }> }>("Target.getTargets");
    const page = targetInfos.find((t) => t.type === "page");
    if (!page) throw new Error("The headless browser has no page.");
    this.#sessionId = (await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: page.targetId, flatten: true })).sessionId;
    await this.#send("Page.enable");
    await this.#send("Runtime.enable");
    await this.#send("Log.enable");
  }

  #send<T = unknown>(method: string, params: object = {}, timeoutMs?: number): Promise<T> {
    return this.#cdp!.send<T>(method, params, this.#sessionId, timeoutMs);
  }

  async #value<T>(expression: string): Promise<T> {
    const r = await this.#send<{ result?: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, returnByValue: true });
    return r.result?.value as T;
  }

  async render(target: RenderTarget): Promise<Capture> {
    const messages: string[] = [];
    const listener = (method: string, params: unknown) => {
      const p = params as { exceptionDetails?: { text?: string; exception?: { description?: string } }; entry?: { level?: string; text?: string } };
      if (method === "Runtime.exceptionThrown") messages.push((p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "An exception was thrown.").split("\n").slice(0, 3).join(" "));
      else if (method === "Log.entryAdded" && p.entry?.level === "error") messages.push(p.entry.text ?? "A console error.");
    };
    this.#events.push(listener);
    try {
      await this.#send("Emulation.setDeviceMetricsOverride", { width: target.width, height: target.height, deviceScaleFactor: 1, mobile: false });
      // Motion makes two renders of one scene differ; ask for none, as a person with the setting would.
      await this.#send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }] });
      const loaded = new Promise<void>((ok) => {
        const l = (method: string) => {
          if (method === "Page.loadEventFired") (this.#events.splice(this.#events.indexOf(l), 1), ok());
        };
        this.#events.push(l);
        setTimeout(ok, CELL_TIMEOUT_MS).unref?.();
      });
      await this.#send("Page.navigate", { url: target.url });
      await loaded;
      const deadline = Date.now() + CELL_TIMEOUT_MS;
      for (;;) {
        const mounted = await this.#value<boolean>(`!!document.getElementById("gable-scene-root")?.firstChild`);
        if (mounted) break;
        if (messages.length > 0) throw new Error(messages[0]);
        if (Date.now() > deadline) throw new Error("The scene did not mount within 20 seconds.");
        await new Promise((r) => setTimeout(r, 100));
      }
      await this.#value(`document.fonts ? document.fonts.ready.then(() => true) : true`).catch(() => undefined);
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      if (messages.length > 0 && !(await this.#value<boolean>(`!!document.getElementById("gable-scene-root")?.firstChild`))) throw new Error(messages[0]);
      const markup = await this.#value<string>(`document.getElementById("gable-scene-root").innerHTML`);
      const contentHeight = await this.#value<number>(`Math.ceil(document.documentElement.scrollHeight)`);
      const { data } = await this.#send<{ data: string }>("Page.captureScreenshot", { format: "png" }, 15000);
      return { png: Buffer.from(data, "base64"), markup: prettyMarkup(markup), contentHeight, console: messages.slice(0, 5) };
    } finally {
      this.#events.splice(this.#events.indexOf(listener), 1);
    }
  }

  close(): void {
    this.#cdp?.close();
    this.#child?.kill();
    const profile = this.#profile;
    // The profile can stay locked for a moment after the browser exits (Windows).
    if (profile)
      setTimeout(() => {
        try {
          rmSync(profile, { recursive: true, force: true });
        } catch {
          // left in the temp directory
        }
      }, 1500).unref?.();
  }
}

interface BaselineRecord {
  file: string;
  scene: string;
  width: number;
  height: number;
  savedAt: number;
  name: string;
}

interface BaselineIndex {
  root: string;
  cells: Record<string, BaselineRecord>;
}

const dataUrl = (png: Uint8Array | Buffer): string => `data:image/png;base64,${Buffer.from(png).toString("base64")}`;

export interface MatrixStoreOptions {
  root: string;
  /** Where baselines are kept (the Designer's data directory). */
  dataDir: string;
  /** The running dev server's URL, with a trailing slash. */
  previewUrl(): string | null;
  /** Replaced in tests. */
  browser?: () => string | null;
  /** Replaced in tests. */
  renderer?: (browser: string) => Pick<HeadlessRenderer, "start" | "render" | "close">;
}

export class MatrixStore {
  readonly #o: MatrixStoreOptions;
  #captures = new Map<string, Capture>();
  #run: MatrixRun | null = null;
  #running: Promise<MatrixRun> | null = null;

  constructor(options: MatrixStoreOptions) {
    this.#o = options;
  }

  get run(): MatrixRun | null {
    return this.#run;
  }

  // --- baselines on disk -----------------------------------------------------------------------------------------

  get #dir(): string {
    return join(this.#o.dataDir, "matrix", createHash("sha1").update(this.#o.root).digest("hex").slice(0, 16));
  }

  #index(): BaselineIndex {
    try {
      return JSON.parse(readFileSync(join(this.#dir, "index.json"), "utf8")) as BaselineIndex;
    } catch {
      return { root: this.#o.root, cells: {} };
    }
  }

  #writeIndex(index: BaselineIndex): void {
    mkdirSync(this.#dir, { recursive: true });
    writeFileSync(join(this.#dir, "index.json.tmp"), JSON.stringify(index, null, 2));
    renameSync(join(this.#dir, "index.json.tmp"), join(this.#dir, "index.json"));
  }

  #baseline(key: CellKey): { record: BaselineRecord; png: Buffer; markup: string } | null {
    const record = this.#index().cells[cellId(key)];
    if (!record) return null;
    try {
      return { record, png: readFileSync(join(this.#dir, record.name + ".png")), markup: readFileSync(join(this.#dir, record.name + ".txt"), "utf8") };
    } catch {
      return null;
    }
  }

  /** Which cells have a baseline, without rendering anything. */
  baselines(): BaselineRecord[] {
    return Object.values(this.#index().cells);
  }

  // --- a run -----------------------------------------------------------------------------------------------------

  #compare(key: CellKey, cap: Capture): Pick<MatrixCell, "status" | "changedPixels" | "changedRatio" | "box"> {
    const base = this.#baseline(key);
    if (!base) return { status: "new" };
    const pixelsEqual = base.png.equals(cap.png);
    const diff = pixelsEqual ? null : diffImages(decodePng(base.png), decodePng(cap.png));
    if (diff && diff.changedPixels > 0) return { status: "changed", changedPixels: diff.changedPixels, changedRatio: diff.ratio, box: diff.box };
    return { status: base.markup === cap.markup ? "same" : "markup", changedPixels: 0, changedRatio: 0, box: null };
  }

  async runMatrix(request: MatrixRequest = {}): Promise<MatrixRun> {
    // One run at a time: a second request waits for the first and gets its answer.
    if (this.#running) return this.#running;
    const p = this.#runNow(request).finally(() => (this.#running = null));
    this.#running = p;
    return p;
  }

  async #runNow(request: MatrixRequest): Promise<MatrixRun> {
    const previewUrl = this.#o.previewUrl();
    if (!previewUrl) throw new Error("The project's dev server is not running yet.");
    const browser = (this.#o.browser ?? (() => findBrowser()))();
    if (!browser) throw new Error("The matrix renders in a headless browser, and none was found. Install Chrome or Edge, or set GABLE_CHROME to a Chromium binary.");
    const breakpoints = sanitizeBreakpoints(request.breakpoints);
    const height = Math.max(240, Math.min(4000, Math.round(request.height ?? MATRIX_HEIGHT)));
    const wantFiles = request.files?.length ? new Set(request.files) : null;
    const wantScenes = request.scenes?.length ? new Set(request.scenes) : null;
    const rows = sceneIndex(this.#o.root)
      .filter((f) => !wantFiles || wantFiles.has(f.file))
      .flatMap((f) => f.scenes.filter((s) => !wantScenes || wantScenes.has(s.name)).map((s) => ({ file: f.file, scene: s.name, component: f.component, description: s.description })));
    const problem = matrixProblem(rows.length, breakpoints.length);
    if (problem) throw new Error(problem);

    const renderer = (this.#o.renderer ?? ((b) => new HeadlessRenderer(b)))(browser);
    await renderer.start();
    const captures = new Map<string, Capture>();
    const cells: MatrixCell[] = [];
    try {
      for (const row of rows) {
        for (const bp of breakpoints) {
          const key: CellKey = { file: row.file, scene: row.scene, width: bp.width };
          const base = { ...key, component: row.component, height };
          try {
            const q = new URLSearchParams({ scenes: row.file, scene: row.scene });
            const cap = await renderer.render({ url: `${previewUrl}__gable-designer/component?${q}`, width: bp.width, height });
            captures.set(cellId(key), cap);
            cells.push({ ...base, ...this.#compare(key, cap), contentHeight: cap.contentHeight, image: dataUrl(cap.png), ...(cap.console.length ? { console: cap.console } : {}) });
          } catch (e) {
            cells.push({ ...base, status: "error", error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
    } finally {
      renderer.close();
    }
    this.#captures = captures;
    return (this.#run = this.#summary(rows, breakpoints, height, cells, browser));
  }

  #summary(rows: MatrixRun["rows"], breakpoints: MatrixBreakpoint[], height: number, cells: MatrixCell[], browser: string): MatrixRun {
    const count = (s: CellStatus) => cells.filter((c) => c.status === s).length;
    const index = this.#index().cells;
    return {
      at: Date.now(),
      breakpoints,
      height,
      rows,
      cells,
      counts: { total: cells.length, new: count("new"), same: count("same"), changed: count("changed"), markup: count("markup"), error: count("error"), withBaseline: cells.filter((c) => index[cellId(c)]).length },
      renderer: browser.split(/[\\/]/).pop() ?? browser,
      note: "Each cell is a fresh render of the scene in a headless browser at the breakpoint's width (no emulation beyond size, light colours and reduced motion).",
    };
  }

  // --- baselines and detail --------------------------------------------------------------------------------------

  #cellsFor(which: "all" | "changed" | CellKey[]): MatrixCell[] {
    const run = this.#run;
    if (!run) throw new Error("Run the matrix first: baselines are saved from the pictures it shows.");
    if (which === "all") return run.cells.filter((c) => c.status !== "error");
    if (which === "changed") return run.cells.filter((c) => c.status === "changed" || c.status === "new" || c.status === "markup");
    const ids = new Set(which.map(cellId));
    const found = run.cells.filter((c) => ids.has(cellId(c)));
    const missing = which.filter((k) => !found.some((c) => cellId(c) === cellId(k)));
    if (missing.length) throw new Error(`Not in the last run: ${missing.map((k) => `${k.scene} at ${k.width}px`).join(", ")}.`);
    const bad = found.find((c) => c.status === "error");
    if (bad) throw new Error(`${bad.scene} at ${bad.width}px did not render (${bad.error}); a baseline needs a picture.`);
    return found;
  }

  /** Saves the last run's pictures of the cells as their baselines. */
  saveBaselines(which: "all" | "changed" | CellKey[]): number {
    const cells = this.#cellsFor(which);
    const index = this.#index();
    mkdirSync(this.#dir, { recursive: true });
    for (const cell of cells) {
      const cap = this.#captures.get(cellId(cell));
      if (!cap) continue;
      const name = createHash("sha1").update(cellId(cell)).digest("hex").slice(0, 16);
      writeFileSync(join(this.#dir, name + ".png"), cap.png);
      writeFileSync(join(this.#dir, name + ".txt"), cap.markup);
      index.cells[cellId(cell)] = { file: cell.file, scene: cell.scene, width: cell.width, height: cell.height, savedAt: Date.now(), name };
    }
    this.#writeIndex({ ...index, root: this.#o.root });
    this.#refresh();
    return cells.length;
  }

  forget(which: "all" | CellKey[]): number {
    const index = this.#index();
    const ids = which === "all" ? Object.keys(index.cells) : which.map(cellId).filter((id) => index.cells[id]);
    for (const id of ids) {
      const r = index.cells[id]!;
      for (const ext of [".png", ".txt"]) rmSync(join(this.#dir, r.name + ext), { force: true });
      delete index.cells[id];
    }
    this.#writeIndex(index);
    this.#refresh();
    return ids.length;
  }

  /** Recomputes the last run's statuses against the baselines as they are now. */
  #refresh(): void {
    const run = this.#run;
    if (!run) return;
    const cells = run.cells.map((c) => {
      const cap = this.#captures.get(cellId(c));
      return cap ? { ...c, ...this.#compare(c, cap) } : c;
    });
    this.#run = { ...this.#summary(run.rows, run.breakpoints, run.height, cells, run.renderer), at: run.at, renderer: run.renderer };
  }

  detail(key: CellKey): MatrixDetail {
    const cell = this.#run?.cells.find((c) => cellId(c) === cellId(key));
    if (!cell) throw new Error(`Not in the last run: ${key.scene} at ${key.width}px. Run the matrix first.`);
    const cap = this.#captures.get(cellId(key));
    const base = this.#baseline(key);
    const out: MatrixDetail = { cell, current: cap ? dataUrl(cap.png) : null, baseline: base ? dataUrl(base.png) : null, diff: null, baselineSavedAt: base?.record.savedAt ?? null, markupDiff: "", sizeChange: null };
    if (!cap || !base) return out;
    const before = decodePng(base.png);
    const after = decodePng(cap.png);
    const diff = diffImages(before, after);
    out.diff = dataUrl(diff.png);
    if (diff.sizeChanged) out.sizeChange = { from: { width: before.width, height: before.height }, to: { width: after.width, height: after.height } };
    if (base.markup !== cap.markup) out.markupDiff = unifiedDiff(`${cell.scene} @ ${cell.width}px (rendered markup)`, base.markup, cap.markup).text;
    return out;
  }
}
