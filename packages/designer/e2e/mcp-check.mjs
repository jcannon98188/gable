// End-to-end check of the MCP control plane (TASK-56.13): a real backend (the built CLI), a real Designer window (the
// shell in headless Edge/Chrome) and MCP clients over streamable HTTP and over stdio.
//
//   npm run build -w packages/designer && node packages/designer/e2e/mcp-check.mjs [--browser <path>] [--keep] [--shot <dir>]
//
// The project is test-fixtures/mcp-app plus an index.html and a main.ts, copied under the designer's dist/ (git-ignored;
// it resolves the workspace's packages from there). Phase 1 runs the backend with --cdp-port (live
// capture of the frame); phase 2 without (the headless-render fallback); phase 3 is the stdio proxy finding the running
// Designer through its session file. Only processes this script starts are stopped.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const designer = join(here, "..");
const cli = join(designer, "dist", "server", "cli.js");
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const keep = process.argv.includes("--keep");
const shotDir = arg("--shot", "");
const browserPath =
  arg("--browser", "") ||
  process.env.GABLE_CHROME ||
  ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(existsSync);
if (!existsSync(cli)) throw new Error("Build the designer first: npm run build -w packages/designer");
if (!browserPath) throw new Error("No Edge or Chrome found; pass --browser <path>.");

let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});

// --- the project ------------------------------------------------------------------------------------------------------
// Not under node_modules: the Gable Vite plugin leaves modules there alone (no HMR, no source info). dist/ is git-ignored
// and still resolves the workspace's packages.
const cache = join(designer, "dist", ".mcp-e2e");
mkdirSync(cache, { recursive: true });
const root = mkdtempSync(join(cache, "app-"));
cpSync(join(designer, "test-fixtures", "mcp-app"), root, { recursive: true });
writeFileSync(join(root, "index.html"), `<!doctype html>\n<html><head><meta charset="utf-8" /><title>MCP fixture</title></head>\n<body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n`);
writeFileSync(join(root, "vite.config.ts"), `import { gable } from "@gable/vite";\nimport { defineConfig } from "vite";\nexport default defineConfig({ plugins: [gable()] });\n`);
writeFileSync(
  join(root, "src", "main.ts"),
  `import { bootstrap, html } from "@gable/core";\nimport { provideRouter, RouterOutlet } from "@gable/core/router";\nimport { dom } from "@gable/renderer-dom";\nimport { ProfileCard } from "./card.js";\nimport { routes } from "./routes.js";\n\nexport class App {\n  static meta = { selector: "app-root", imports: [ProfileCard, RouterOutlet], template: html\`<main><app-profile-card></app-profile-card><router-outlet></router-outlet></main>\` };\n}\n\nbootstrap(App, { renderer: dom(), providers: provideRouter(routes), target: "#app" });\n`,
);
const dataDir = mkdtempSync(join(cache, "data-"));
const env = { ...process.env, GABLE_DESIGNER_DATA: dataDir };
const card = join(root, "src", "card.ts");
const cardOriginal = readFileSync(card, "utf8");
const at = (needle) => {
  const lines = readFileSync(card, "utf8").split(/\r?\n/);
  const line = lines.findIndex((l) => l.includes(needle));
  return { file: "src/card.ts", line: line + 1, column: lines[line].indexOf(needle) + 2 };
};

// --- processes we start (and only those are stopped) -------------------------------------------------------------------
const children = [];
const stopAll = async () => {
  for (const c of children.splice(0)) {
    if (c.exitCode !== null) continue;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
  await sleep(800);
};

async function startDesigner(cdpPort) {
  const args = [cli, root, ...(cdpPort ? ["--cdp-port", String(cdpPort)] : [])];
  const child = spawn(process.execPath, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  let log = "";
  child.stderr.on("data", (d) => (log += d));
  const ready = await new Promise((ok, fail) => {
    let out = "";
    const timer = setTimeout(() => fail(new Error(`backend did not start:\n${log}`)), 60000);
    child.stdout.on("data", (d) => {
      out += d;
      const m = /GABLE_DESIGNER_READY (.*)/.exec(out);
      if (m) (clearTimeout(timer), ok(JSON.parse(m[1])));
    });
    child.on("exit", (code) => fail(new Error(`backend exited ${code}:\n${log}`)));
  });
  return { ready, log: () => log };
}

async function startBrowser(url, port) {
  const profile = mkdtempSync(join(cache, "profile-"));
  const child = spawn(browserPath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1600,1000", url], { stdio: "ignore" });
  children.push(child);
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      return child;
    } catch {
      await sleep(150);
    }
  }
  throw new Error("browser did not open its debugging port");
}

async function mcpOver(ready) {
  const client = new Client({ name: "mcp-check", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(ready.mcp.url), { requestInit: { headers: { authorization: `Bearer ${ready.mcp.token}` } } }));
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (r.isError) throw new Error(`${name}: ${text}`);
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // a text answer
    }
    return { r, text, json };
  };
  return { client, call };
}

const until = async (fn, what, ms = 30000) => {
  const t = Date.now();
  let last;
  while (Date.now() - t < ms) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(300);
  }
  throw new Error(`timed out: ${what}${last ? ` (${last.message})` : ""}`);
};

const savePng = (name, b64) => {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(join(shotDir, name), Buffer.from(b64, "base64"));
};
const pngSize = (b64) => {
  const b = Buffer.from(b64, "base64");
  return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
};

try {
  // ---- phase 1: live window over CDP ------------------------------------------------------------------------------------
  const cdpPort = await freePort();
  const d1 = await startDesigner(cdpPort);
  check(d1.ready.mcp?.url === `${d1.ready.url}/mcp` && !!d1.ready.mcp.token, "the READY line names the MCP endpoint and its token", d1.ready.mcp?.url);
  const unauth = await fetch(d1.ready.mcp.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check(unauth.status === 401, "an unauthenticated MCP request is refused", String(unauth.status));

  const m = await mcpOver(d1.ready);
  const before = (await m.call("get_status")).json;
  check(before.window.connected === false && before.window.open === `${d1.ready.url}/`, "without a window, get_status says where to open one", before.window.open);

  await startBrowser(`${d1.ready.url}/`, cdpPort);
  const status = await until(async () => {
    const s = (await m.call("get_status")).json;
    return s.window.connected && s.window.connection === "ready" && s.project.ready ? s : null;
  }, "the window connects and its preview is ready", 60000);
  check(status.window.frames.length >= 1, "get_status reports the window's frames", status.window.frames.map((f) => `${f.id} ${f.width}x${f.height}`).join(", "));
  check(status.tailwind.enabled, "Tailwind mode is on for the fixture", status.tailwind.version);

  const modeR = (await m.call("set_mode", { mode: "interact" })).json;
  check(modeR.mode === "interact", "set_mode changes the window's mode");
  check((await m.call("get_status")).json.window.mode === "interact", "the window reports the new mode back (one source of UI state)");
  await m.call("set_mode", { mode: "select" });

  const page = (await m.call("show_page")).json;
  check(page.target.kind === "page" && page.connection === "ready", "show_page switches to page mode and waits for the reload", page.connection);
  const nav = (await m.call("navigate", { url: "/about" })).json;
  check(nav.url?.includes("about"), "navigate moves the router", nav.url);
  const routes = (await m.call("list_routes")).json;
  check(routes.config.file === "src/routes.ts" && routes.runtime.length > 0, "list_routes has the source config and the running router", routes.runtime.map((r) => r.url).join(", "));

  const tree = (await m.call("get_tree")).text;
  check(tree.includes("ProfileCard") && tree.includes("App"), "get_tree shows the running component tree", tree.split("\n").length + " lines");

  const sel = (await m.call("select_element", { target: at("<h2") })).json;
  check(sel.selection?.tag === "h2" && sel.selection.at?.line === at("<h2").line, "select_element by source position selects it in the window", JSON.stringify(sel.selection?.at));
  const bySel = (await m.call("select_element", { selector: "section p" })).json;
  check(bySel.selection?.tag === "p", "select_element by CSS selector", bySel.selection?.tag);
  await m.call("select_element", { target: at("<h2") });
  const got = (await m.call("get_selection")).json;
  check(got.element?.tag === "h2" && got.selection.component?.name === "ProfileCard", "get_selection reads the window's selection with its model", got.selection.component?.name);
  const signals = (await m.call("get_signals")).json;
  check(signals.signals?.some((s) => s.name === "followed"), "get_signals reads the selected component's signals", signals.signals?.map((s) => `${s.name}=${s.value}`).join(" "));

  const edit = (await m.call("edit_text", { text: "Grace Hopper" })).json;
  check(edit.ok && edit.diff.includes("+        <h2 class=\"font-bold\">Grace Hopper</h2>"), "edit_text on the selection writes a minimal patch and returns it", edit.diff.split("\n").filter((l) => /^[-+] /.test(l)).length + " changed lines");
  check(readFileSync(card, "utf8") === cardOriginal.replace("Ada Lovelace", "Grace Hopper"), "the file changed by exactly that");
  const hmr = await until(async () => {
    const h = (await m.call("get_hmr_timeline")).json;
    return Array.isArray(h) && h.length ? h : null;
  }, "HMR reaches the frame");
  check(hmr.length > 0, "get_hmr_timeline shows the hot update", JSON.stringify(hmr.at(-1)).slice(0, 120));
  const reselected = await until(async () => (await m.call("get_selection")).json.selection?.tag === "h2", "the window selects the element again after HMR", 10000).catch(() => false);
  check(reselected, "the edited element is selected again after the hot update");

  const cls = (await m.call("edit_classes", { target: at("<section"), add: ["p-8"], breakpoint: "md" })).json;
  check(cls.classes.includes("md:p-8") && cls.classes.includes("p-4"), "edit_classes writes at a breakpoint without touching the base class", cls.classes);

  const shot = await m.call("screenshot");
  const img = shot.r.content.find((c) => c.type === "image");
  const size = img && pngSize(img.data);
  check(!!size && size.width > 100, "screenshot returns a PNG image (CDP)", `${size?.width}x${size?.height}; ${shot.text}`);
  if (img) savePng("cdp.png", img.data);

  const framesBefore = (await m.call("get_status")).json.window.frames.length;
  const added = (await m.call("add_frame", { preset: "iphone-15" })).json;
  check(added.frames.length === framesBefore + 1, "add_frame adds a frame to the canvas", added.frames.map((f) => f.name).join(", "));
  const newId = added.frames.at(-1).id;
  const upd = (await m.call("update_frame", { frame: newId, colorScheme: "dark", landscape: true })).json;
  const nf = upd.frames.find((f) => f.id === newId);
  check(nf.emulation.colorScheme === "dark" && nf.width > nf.height, "update_frame changes emulation and orientation", `${nf.width}x${nf.height} ${nf.emulation.colorScheme}`);
  const selF = (await m.call("select_frame", { frame: newId })).json;
  check(selF.selectedFrame === newId, "select_frame selects it");
  const removed = (await m.call("remove_frame", { frame: newId })).json;
  check(removed.frames.length === framesBefore, "remove_frame removes it");

  await m.call("undo");
  await m.call("undo");
  check(readFileSync(card, "utf8") === cardOriginal, "two undos restore the file byte for byte");
  const redo = (await m.call("redo")).json;
  check(redo.ok && readFileSync(card, "utf8").includes("Grace Hopper"), "redo applies the edit again");
  await m.call("undo");

  const comp = (await m.call("show_component", { scenes: "/src/card.scenes.ts", scene: "Default" })).json;
  check(comp.target.kind === "component" && comp.scene === "Default", "show_component mounts a scene", `${comp.target.scenes} / ${comp.scene}`);
  await m.client.close();

  // ---- phase 3 (while phase 1's backend runs): the stdio proxy finds it through the session file --------------------------
  const stdio = new Client({ name: "mcp-check-stdio", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "mcp", root, "--no-start"], env, stderr: "pipe" });
  await stdio.connect(transport);
  children.push({ pid: transport.pid, exitCode: null, kill() {} });
  const tools = await stdio.listTools();
  check(tools.tools.length > 25, "stdio: the proxy lists the tools of the running Designer", `${tools.tools.length} tools`);
  const st = JSON.parse((await stdio.callTool({ name: "get_status", arguments: {} })).content[0].text);
  check(st.window.connected === true && st.project.root === root, "stdio: drives the same backend and window", st.window.mode);
  await stdio.close();

  await stopAll();

  // ---- phase 2: no CDP port, the fallback renders the frame's URL headless ------------------------------------------------
  const d2 = await startDesigner(null);
  const browserPort = await freePort();
  await startBrowser(`${d2.ready.url}/`, browserPort);
  const m2 = await mcpOver(d2.ready);
  await until(async () => {
    const s = (await m2.call("get_status")).json;
    return s.window.connected && s.window.connection === "ready";
  }, "the window connects (phase 2)", 60000);
  const s2 = (await m2.call("get_status")).json;
  check(s2.screenshot.startsWith("fresh render"), "get_status names the fallback", s2.screenshot);
  const shot2 = await m2.call("screenshot");
  const img2 = shot2.r.content.find((c) => c.type === "image");
  const size2 = img2 && pngSize(img2.data);
  check(!!size2 && size2.width > 100, "screenshot falls back to a headless render", `${size2?.width}x${size2?.height}; ${shot2.text}`);
  if (img2) savePng("headless.png", img2.data);
  await m2.client.close();
} catch (e) {
  failed++;
  console.log(`FAIL  ${e.stack ?? e}`);
} finally {
  await stopAll();
  writeFileSync(card, cardOriginal);
  if (!keep) rmSync(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
