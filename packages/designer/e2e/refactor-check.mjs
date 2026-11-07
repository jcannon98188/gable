// Driven check of refactors from the canvas (TASK-56.24): Rename component and Find uses (palette and Inspector), Extract with
// props, and MCP find_uses / rename_component / extract_component over HTTP. A rename is one undo step over every file it
// touches; Find uses lists declaration, imports, code references and template uses, and a template use selects its element.
//
//   npm run build -w packages/designer && node packages/designer/e2e/refactor-check.mjs [--browser <path>]
//
// It runs against test-fixtures/refactor-app, snapshots its src/ and puts every file back byte for byte (removing files it
// created, failing if it could not). It starts the backend with --cdp-port and a headless Edge on that port, and stops exactly
// the processes it started (each by its PID, with its own child tree), nothing else.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connect, connectBrowser } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const here = fileURLToPath(new URL(".", import.meta.url));
const project = join(here, "..", "test-fixtures", "refactor-app");
const srcDir = join(project, "src");
const snapshot = new Map(readdirSync(srcDir).map((f) => [f, readFileSync(join(srcDir, f), "utf8")]));
const read = (f) => readFileSync(join(srcDir, f), "utf8");
const pristine = () => readdirSync(srcDir).length === snapshot.size && [...snapshot].every(([f, text]) => existsSync(join(srcDir, f)) && read(f) === text);

let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

// --- the processes this script owns ---------------------------------------------------------------------------------
const started = [];
let profile = null;
function stopStarted() {
  for (const child of started.reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    // The child's own tree only (the backend's Vite and worker, Edge's renderers), by the PID this script spawned.
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  if (profile) {
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 300)"]);
      }
    }
  }
}
process.on("exit", stopStarted);
process.on("SIGINT", () => process.exit(130));

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function spawnAll() {
  const cli = join(here, "..", "dist", "server", "cli.js");
  if (!existsSync(cli)) throw new Error("Build the Designer first: npm run build -w packages/designer");
  const cdpPort = await freePort();
  const backend = spawn(process.execPath, [cli, project, "--cdp-port", String(cdpPort)], { stdio: ["ignore", "pipe", "pipe"] });
  started.push(backend);
  backend.stderr.on("data", (d) => process.env.CHECK_VERBOSE && process.stderr.write(d));
  const ready = await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("the backend did not start in 90s")), 90000);
    backend.stdout.on("data", (d) => {
      out += d;
      const m = /GABLE_DESIGNER_READY (.+)/.exec(out);
      if (m) (clearTimeout(timer), resolve(JSON.parse(m[1])));
    });
    backend.once("exit", (code) => reject(new Error(`the backend exited (${code})`)));
  });
  const browser = arg(
    "--browser",
    process.env.EDGE_PATH ?? ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => existsSync(p)),
  );
  if (!browser) throw new Error("No Edge found: pass --browser <path to a Chromium>");
  profile = mkdtempSync(join(tmpdir(), "gable-refactor-check-"));
  const edge = spawn(browser, [`--headless=new`, `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1600,1000", `${ready.url}/`], { stdio: "ignore" });
  started.push(edge);
  const host = new URL(ready.url).host;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      if (list.some((t) => t.type === "page" && t.url.includes(host))) break;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { port: cdpPort, shell: host, ready };
}

const target = await spawnAll();
const page = await connect(target.port, target.shell);
const browser = await connectBrowser(target.port);
const { ev, sleep, until, cdp } = page;
const key = async (k, code, vk, modifiers = 0) => {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const palette = async (query) => {
  await key("k", "KeyK", 75, 2);
  await until(() => ev(`!!document.querySelector('[role="dialog"] input')`), "the palette opens");
  await sleep(150);
  await cdp("Input.insertText", { text: query });
  await sleep(250);
  await key("Enter", "Enter", 13);
  await sleep(500);
};
const type = async (part, text) => {
  await ev(`(() => { const el = document.querySelector('[data-part="${part}"]'); el.focus(); el.select?.(); })()`);
  await cdp("Input.insertText", { text });
  await sleep(150);
};
const click = (part) => ev(`document.querySelector('[data-part="${part}"]').click()`);
const visible = (part) => ev(`document.querySelector('[data-part="${part}"]')?.checkVisibility() === true`);
const disabled = (part) => ev(`document.querySelector('[data-part="${part}"]')?.disabled === true`);
const text = (part) => ev(`document.querySelector('[data-part="${part}"]')?.innerText.replace(/\\s+/g, " ").trim() ?? ""`);
/** Clicks an element of the preview frame (select mode picks it). */
const pick = async (selector) => {
  const frame = await until(async () => (await browser.frames()).find((f) => f.url.includes("localhost")), "the preview frame");
  await until(() => frame.ev(`!!document.querySelector(${JSON.stringify(selector)})`), `${selector} in the frame`);
  const inner = await frame.ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const outer = await ev(`(() => { const f = document.querySelector("app-frame-view iframe"); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / f.offsetWidth }; })()`);
  const x = outer.x + inner.x * outer.scale;
  const y = outer.y + inner.y * outer.scale;
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(80);
  for (const t of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type: t, x, y, button: "left", clickCount: 1 });
};
const undoByKey = async () => {
  await ev(`document.activeElement?.blur?.()`);
  await key("z", "KeyZ", 90, 2);
};
const at = (file, needle) => {
  const lines = read(file).split(/\r?\n/);
  const line = lines.findIndex((l) => l.includes(needle));
  return { file: `src/${file}`, line: line + 1, column: lines[line].indexOf(needle) + 2 };
};

let mcp = null;
try {
  await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 90000);
  await sleep(800);
  mcp = new Client({ name: "refactor-check", version: "1" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(target.ready.mcp.url), { requestInit: { headers: { authorization: `Bearer ${target.ready.mcp.token}` } } }));
  const callRaw = (name, args = {}) => mcp.callTool({ name, arguments: args });
  const call = async (name, args = {}) => {
    const r = await callRaw(name, args);
    const t = r.content.map((c) => c.text ?? "").join("\n");
    if (r.isError) throw new Error(`${name}: ${t}`);
    return JSON.parse(t);
  };

  // --- Rename from the canvas: select an element of the component, open Rename ------------------------------------------
  await pick("section.panel h2");
  await until(async () => (await call("get_selection")).selection?.tag === "h2", "the <h2> is selected", 15000);
  await palette("Rename component");
  await until(() => visible("rename-to"), "the Rename dialog");
  check((await text("rename-from")) === "RefactorApp", "Rename names the selected element's component", await text("rename-from"));
  check(await disabled("rename-submit"), "Rename is disabled until there is a new name");
  await type("rename-to", "Badge");
  await sleep(300);
  await click("rename-submit");
  await until(() => visible("rename-error"), "the refusal is shown", 10000).catch(() => null);
  check(/already|taken|exists/i.test(await text("rename-error")) && pristine(), "a taken name is refused with a reason and nothing is written", await text("rename-error"));
  await type("rename-to", "RefactorShell");
  await until(async () => !(await disabled("rename-submit")), "Rename is enabled for a free name", 10000);
  check(/reference/.test(await text("rename-touches")), "the dialog says what a rename touches", await text("rename-touches"));
  await click("rename-submit");
  await until(() => read("main.ts").includes("RefactorShell"), "the rename is written", 15000);
  check(read("refactor-app.ts").includes("export class RefactorShell") && read("main.ts").includes("bootstrap(RefactorShell") && read("main.ts").includes("import { RefactorShell }") && !/RefactorApp/.test(read("main.ts") + read("refactor-app.ts")), "the class is renamed in its file and the importer");
  check(read("refactor-app.ts").includes('selector: "app-root"'), "the selector is untouched without the option");
  await until(() => visible("rename-to").then((v) => !v), "the dialog closes", 8000).catch(() => null);
  check(!(await visible("rename-to")), "the dialog closes after a rename");
  await undoByKey();
  await until(() => pristine(), "one undo restores every file", 15000).catch(() => null);
  check(pristine(), "one undo restores both files byte for byte");

  // --- Find uses --------------------------------------------------------------------------------------------------------
  await palette("Find uses");
  await until(() => visible("uses-name"), "the Find uses dialog");
  await type("uses-name", "Badge");
  await click("uses-search");
  await until(async () => (await ev(`document.querySelectorAll('[data-part="use"]').length`)) >= 5, "the uses are listed", 15000);
  const kinds = await ev(`[...document.querySelectorAll('[data-part="use"]')].map((b) => b.dataset.kind)`);
  check(["declaration", "import", "imports", "template"].every((k) => kinds.includes(k)), "Find uses lists the declaration, import, imports list and template uses", kinds.join(", "));
  check(kinds.filter((k) => k === "template").length === 2, "both <app-badge> uses are listed", kinds.join(", "));
  await ev(`document.querySelector('[data-part="use"][data-kind="template"]').click()`);
  await until(async () => (await call("get_selection")).selection?.tag === "app-badge", "a template use selects its element", 15000);
  check(true, "clicking a template use selects that element on the canvas");
  await key("Escape", "Escape", 27);
  await sleep(400);

  // --- Extract with props -----------------------------------------------------------------------------------------------
  await pick("section.panel");
  await until(async () => (await call("get_selection")).selection?.tag === "section", "the <section> is selected", 15000);
  await palette("Extract to component");
  await until(() => visible("extract-name"), "the Extract dialog");
  await type("extract-name", "PanelNote");
  await sleep(400);
  check(/static markup/.test(await text("extract-why")) && (await disabled("extract-submit")), "signal reads are refused without props, and the dialog says why", await text("extract-why"));
  check(await visible("extract-props"), "the dialog offers the props option");
  await click("extract-props");
  await until(async () => !(await disabled("extract-submit")), "Extract is enabled with props", 10000);
  check(!(await disabled("extract-submit")), "Extract is enabled once the signal reads become inputs");
  await click("extract-submit");
  await until(() => existsSync(join(srcDir, "panel-note.ts")), "the component file is created", 15000);
  const made = read("panel-note.ts");
  check(/heading = input\.required/.test(made) && /note = input\.required/.test(made) && made.includes("static meta"), "the new component has an input for each signal read", `${made.split("\n").length} lines`);
  const flat = read("refactor-app.ts").replace(/\s+/g, " ");
  check(/<app-panel-note \[heading\]="heading\(\)" \[note\]="note\(\)"/.test(flat) && read("refactor-app.ts").includes("import { PanelNote }"), "the usage binds them and the class is imported", flat.match(/<app-panel-note[^>]*>/)?.[0]);
  await undoByKey();
  await until(() => pristine(), "undo restores the source and removes the file", 15000).catch(() => null);
  check(pristine(), "one undo removes the created file and restores the template");

  // --- MCP over HTTP ----------------------------------------------------------------------------------------------------
  const uses = await call("find_uses", { kind: "component", name: "Badge" });
  const firstTemplate = uses.uses.find((u) => u.kind === "template");
  check(uses.declaration?.selector === "app-badge" && uses.uses.filter((u) => u.kind === "template").length === 2 && !!firstTemplate?.select?.target, "find_uses: declaration, template uses with select.target", String(uses.count));
  await call("select_element", { target: firstTemplate.select.target });
  check((await call("get_selection")).selection?.tag === "app-badge", "a use's select.target works with select_element");
  const cls = await call("find_uses", { kind: "class", name: "pill" });
  check(cls.uses.map((u) => u.kind).sort().join() === "class-attr,css", "find_uses for a class lists the attribute and the css rule", cls.uses.map((u) => u.kind).join());
  check((await callRaw("find_uses", { kind: "component", name: "Nope" })).isError === true, "an unknown component is an error");

  const renamed = await call("rename_component", { from: "Badge", to: "Chip", selector: "app-chip" });
  const nowAll = [...snapshot.keys()].map(read).join("\n");
  check(/export class Chip/.test(read("badge.ts")) && /selector: "app-chip"/.test(read("badge.ts")) && (read("refactor-app.ts").match(/<app-chip><\/app-chip>/g) ?? []).length === 2 && read("styles.css").startsWith("app-chip {") && !/Badge|app-badge/.test(nowAll.replace(/\/\/.*$/gm, "")), "rename_component with selector rewrites class, meta, both uses and the css", JSON.stringify(renamed.changed));
  check((renamed.changed ?? []).length === 3, "it reports the three files it changed", JSON.stringify(renamed.changed));
  const clash = await callRaw("rename_component", { from: "Chip", to: "RefactorApp" });
  check(clash.isError === true, "renaming onto a taken name is refused");
  await call("undo");
  check(pristine(), "one MCP undo restores every file of a multi-file rename");

  const refused = await callRaw("extract_component", { target: at("refactor-app.ts", "<section"), name: "PanelNote" });
  check(refused.isError === true && pristine(), "without props the signal reads are refused and nothing is written");
  const ex = await call("extract_component", { target: at("refactor-app.ts", "<section"), name: "PanelNote", props: true });
  check(ex.created?.includes("src/panel-note.ts") && /input\.required/.test(read("panel-note.ts")), "extract_component with props creates the component", JSON.stringify(ex.created));
  await call("undo");
  check(pristine(), "MCP undo removes the extracted file and restores the template");
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
  const seen = await ev(`({ dialog: document.querySelector('[role="dialog"]')?.innerText.replace(/\\s+/g, " ").slice(0, 400) ?? null, toasts: document.querySelector('[aria-label="Notifications"]')?.textContent.replace(/\\s+/g, " ").slice(0, 300) ?? null })`).catch((x) => String(x));
  console.log("shell state:", JSON.stringify(seen));
} finally {
  await mcp?.close().catch(() => undefined);
  // Put the fixture back: files it had, byte for byte, and none it did not.
  for (const f of readdirSync(srcDir)) if (!snapshot.has(f)) rmSync(join(srcDir, f), { force: true });
  for (const [f, content] of snapshot) if (!existsSync(join(srcDir, f)) || read(f) !== content) writeFileSync(join(srcDir, f), content);
  check(pristine(), "the fixture is byte-identical at the end");
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
