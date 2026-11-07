// Driven check of the drawer's Focus & tree tab and the keyboard tools (TASK-56.26): the real Tab order of the fixture page
// (a positive tabindex first, a div that is only a role listed as unreachable, an unnamed field), the numbered order drawn on
// the canvas, stepping focus (and finding the button that hides its focus ring), the accessibility tree with its warnings,
// keyboard-only mode (a real mouse click is ignored, Enter on the focused button still works) and the MCP tools doing the same.
//
//   npm run build -w packages/designer && node packages/designer/e2e/a11y-depth-check.mjs [--browser <path>] [--shot <file>]
//
// It runs against test-fixtures/focus-app, which has keyboard problems on purpose, and writes nothing (the check fails if
// its files differ at the end). It starts the backend with --cdp-port and a headless Edge on that port, and stops exactly
// the processes it started (each by its PID), nothing else.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connect, connectBrowser } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const here = fileURLToPath(new URL(".", import.meta.url));
const project = join(here, "..", "test-fixtures", "focus-app");
const sourceFile = join(project, "src", "focus-app.ts");
const indexFile = join(project, "index.html");
const original = readFileSync(sourceFile, "utf8");
const originalIndex = readFileSync(indexFile, "utf8");
const noCdp = process.argv.includes("--no-cdp");

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
  const backend = spawn(process.execPath, [cli, project, ...(noCdp ? [] : ["--cdp-port", String(cdpPort)])], { stdio: ["ignore", "pipe", "pipe"] });
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
  profile = mkdtempSync(join(tmpdir(), "gable-a11y-depth-check-"));
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
const { ev, sleep, until } = page;
const q = (js) => ev(`(() => { ${js} })()`);
const previewHost = new URL(target.ready.previewUrl).host;

/** Evaluates in the preview frame (the first frame: the project's own origin). */
const inFrame = async (js) => {
  const frame = (await browser.frames()).find((f) => f.url.includes(previewHost));
  if (!frame) throw new Error("the preview frame is not there");
  return frame.ev(js);
};

const frameText = () => inFrame(`document.body.innerText`).catch(() => "");
const frameOverlay = () => inFrame(`[...document.querySelectorAll("[data-gable-designer] *")].map((d) => d.textContent)`);
const rows = (part) => q(`return [...document.querySelectorAll('[data-part="${part}"]')].map((r) => r.innerText.replace(/\\s+/g, " ").trim())`);

const mcp = new Client({ name: "a11y-depth-check", version: "1" });
await mcp.connect(new StreamableHTTPClientTransport(new URL(target.ready.mcp.url), { requestInit: { headers: { authorization: `Bearer ${target.ready.mcp.token}` } } }));
const call = async (name, args = {}) => {
  const r = await mcp.callTool({ name, arguments: args });
  const t = r.content[0]?.text ?? "";
  let body;
  try {
    body = JSON.parse(t);
  } catch {
    body = t;
  }
  return { error: !!r.isError, body };
};

try {
  await until(async () => /Keyboard fixture/.test(await frameText()), "the fixture is rendered in the frame", 90000);

  // --- the Focus & tree tab: the order the browser tabs in ---
  await until(async () => (await q(`return !!document.querySelector("app-focus-panel")`)) || (await q(`document.querySelector("#drawer-tab-focus")?.click(); return false`)), "the Focus & tree panel opens", 30000);
  await until(() => q(`return document.querySelectorAll('[data-part="focus-row"]').length > 0`), "the focus order is listed", 30000);
  const stops = await rows("focus-row");
  check(/^1 button Pay first/.test(stops[0] ?? ""), "a positive tabindex puts its button first, as the browser tabs", stops[0]);
  check(stops.length === 6, "six Tab stops", String(stops.length));
  check(/positive tabindex/i.test(stops[0] ?? ""), "the stop with a positive tabindex says what is wrong");
  check(stops.some((s) => /textbox/.test(s) && /No accessible name/.test(s)), "the unnamed text field is flagged", stops.find((s) => /textbox/.test(s)));
  const unreachable = await rows("focus-unreachable");
  check(unreachable.length === 1 && /Fake button/.test(unreachable[0]), "the div that is only a role=button is listed as unreachable by keyboard", unreachable[0]);
  const badge = await q(`return document.querySelector("#drawer-tab-focus .count")?.textContent.trim() ?? ""`);
  check(Number(badge) >= 3, "the tab's badge counts the problems", badge);
  check(/6 Tab stops/.test(await q(`return document.querySelector('[data-part="focus-summary"]').textContent`)), "the summary counts the Tab stops");

  // --- the numbered overlay on the canvas ---
  await q(`document.querySelector('[data-part="focus-overlay"] label').click()`);
  await until(async () => (await frameOverlay().catch(() => [])).includes("6"), "the canvas draws the numbers", 15000);
  const numbers = (await frameOverlay()).filter((t) => /^\d+$/.test(t));
  check(["1", "2", "3", "4", "5", "6"].every((n) => numbers.includes(n)) && !numbers.includes("7"), "the canvas numbers every Tab stop in tab order", numbers.join(","));

  // --- stepping focus from the panel moves the page's real focus ---
  await q(`document.querySelector('[data-part="focus-next"]').click()`);
  await until(async () => (await inFrame(`document.activeElement?.textContent`).catch(() => "")) === "Pay first", "focus moved to the first stop");
  check(true, "Next stop moves the page's focus to the first Tab stop");
  await until(async () => (await frameOverlay()).some((t) => /^Focus: <button> "Pay first"/.test(t)), "the focused element is outlined and named");
  check(true, "the focused element is outlined and named on the canvas");

  // --- the accessibility tree ---
  await q(`[...document.querySelectorAll('[data-part="focus-section"] button')].find((b) => /tree/i.test(b.textContent)).click()`);
  await until(() => q(`return document.querySelectorAll('[data-part="tree-row"]').length > 0`), "the tree is listed", 30000);
  const tree = (await rows("tree-row")).map((r) => r.replace(/^[▾▸] /, ""));
  check(tree.some((r) => /^heading "Keyboard fixture"/.test(r)), "the tree has the heading", tree.slice(0, 4).join(" | "));
  check(tree.some((r) => /^navigation "Main"/.test(r)) && tree.some((r) => /link "Home"/.test(r)), "the tree has the landmark and its links");
  check(tree.some((r) => /^textbox/.test(r) && /name/i.test(r)), "the field without a name is marked in the tree", tree.find((r) => /^textbox/.test(r)));
  check(/1 without a name/.test(await q(`return document.querySelector('[data-part="tree-unnamed"]').textContent`)), "the tree counts the unnamed control");
  check(/1 heading level skip/.test(await q(`return document.querySelector('[data-part="tree-skips"]').textContent`)), "the tree counts the heading skip");
  const before = (await rows("tree-row")).length;
  await q(`document.querySelector('[data-part="tree-row"][data-role="navigation"] [data-part="tree-toggle"]').click()`);
  await until(async () => (await rows("tree-row")).length < before, "collapsing hides the children");
  check(true, "a tree node collapses");
  await q(`document.querySelector('[data-part="tree-row"][data-role="navigation"] [data-part="tree-toggle"]').click()`);

  // --- MCP: the same reports, and driving the view ---
  const order = await call("get_focus_order");
  check(!order.error && order.body.stops === 6 && /positive-tabindex/.test(order.body.order[0]) && order.body.unreachable.length === 1, "get_focus_order answers the order and what is wrong", order.error ? String(order.body) : order.body.order?.[0]);
  const treeCall = await call("get_a11y_tree");
  check(!treeCall.error && treeCall.body.unnamedControls === 1 && treeCall.body.headingLevelSkips === 1 && treeCall.body.tree.some((l) => /^ *navigation "Main"/.test(l)), "get_a11y_tree answers the outline with its counts", treeCall.error ? String(treeCall.body) : "");
  const run = await call("step_focus", { to: "first", steps: 6 });
  check(!run.error && run.body.visited.length === 6 && run.body.trapped === null, "step_focus walks the whole page without a trap", run.error ? String(run.body) : String(run.body.trapped ?? ""));
  check(run.body.visited?.filter((v) => /no visible focus indicator/.test(v)).length === 1 && run.body.visited.some((v) => /No ring.*no visible focus indicator/.test(v)), "step_focus finds exactly the button that hides its focus ring", run.body.visited?.join(" | "));
  const ax = await call("get_accessibility", { rerun: true });
  check(!ax.error && ax.body.violations > 0, "get_accessibility answers the checker's findings", ax.error ? String(ax.body) : "");

  await call("set_a11y_view", { focusOrder: false });
  await until(async () => !(await frameOverlay()).some((t) => /^\d+$/.test(t)), "the numbers go away");
  check(true, "set_a11y_view turns the canvas overlay off");
  const on = await call("set_a11y_view", { focusOrder: true, keyboardOnly: true });
  check(!on.error && on.body.view.focusOrder && on.body.view.keyboardOnly, "set_a11y_view turns both on");
  await until(() => q(`return !!document.querySelector('[data-part="focus-keyboard-note"]')`), "the window shows keyboard-only mode");
  check(true, "the window shows keyboard-only mode");

  // --- keyboard-only: the page ignores the mouse, the keyboard still works ---
  await call("set_mode", { mode: "interact" });
  const countText = () => inFrame(`document.querySelector('[data-test="counted"]').textContent`);
  const click = async () => {
    const r = await inFrame(`(() => { const b = document.querySelector('[data-test="count"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: innerWidth }; })()`);
    const f = await q(`const r = document.querySelector("iframe").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width }`);
    const s = f.w / r.w;
    const at = { x: f.l + r.x * s, y: f.t + r.y * s, button: "left", clickCount: 1 };
    await page.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...at });
    await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...at });
    await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...at });
    await sleep(300);
  };
  await call("set_a11y_view", { keyboardOnly: false });
  await sleep(300);
  await click();
  check((await countText()) === "Count: 1", "without keyboard-only, a real mouse click operates the page", await countText());
  await call("set_a11y_view", { keyboardOnly: true });
  await sleep(300);
  await click();
  check((await countText()) === "Count: 1", "with keyboard-only, a real mouse click does nothing", await countText());
  await q(`document.querySelector("iframe").focus()`);
  await call("step_focus", { to: "last" });
  await until(async () => (await inFrame(`document.activeElement?.dataset?.test`)) === "count", "focus is on the count button");
  for (const type of ["keyDown", "keyUp"]) await page.cdp("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) });
  await sleep(400);
  check((await countText()) === "Count: 2", "the keyboard still operates it (Enter on the focused button)", await countText());
  await call("set_a11y_view", { focusOrder: false, keyboardOnly: false });
  await call("set_mode", { mode: "select" });

  if (arg("--shot")) {
    await call("set_a11y_view", { focusOrder: true });
    await sleep(1200);
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
  console.log("panel:", await q(`return document.querySelector("app-focus-panel")?.innerText.slice(0, 1500) ?? "(no panel)"`).catch(String));
  console.log("overlay:", await frameOverlay().catch(String));
  console.log("frame:", (await frameText()).slice(0, 300));
} finally {
  check(readFileSync(sourceFile, "utf8") === original && readFileSync(indexFile, "utf8") === originalIndex, "the fixture is byte-identical at the end (the check writes nothing)");
  await mcp.close().catch(() => undefined);
  page.close();
  browser.close();
  stopStarted();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
