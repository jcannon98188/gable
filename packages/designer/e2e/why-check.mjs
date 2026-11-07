// Driven check of "why did this update" (TASK-56.19): select an element in the preview, the Why tab lists its bindings with the
// signals they depend on (through a computed) and, after a write, the signal behind each run; Highlight updates outlines the
// element on the canvas; the same over MCP: why_did_update and highlight_updates.
//
//   npm run build -w packages/designer && node packages/designer/e2e/why-check.mjs [--browser <path>] [--shot <file>]
//
// It runs against test-fixtures/state-app and changes no file. It starts the backend and a headless Edge, and stops exactly
// the processes it started (each by its PID, with its own child tree), nothing else.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connect, connectBrowser } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const here = fileURLToPath(new URL(".", import.meta.url));
const project = join(here, "..", "test-fixtures", "state-app");

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
  profile = mkdtempSync(join(tmpdir(), "gable-why-check-"));
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

const mcp = new Client({ name: "why-check", version: "1" });
await mcp.connect(new StreamableHTTPClientTransport(new URL(target.ready.mcp.url), { requestInit: { headers: { authorization: `Bearer ${target.ready.mcp.token}` } } }));
const call = async (name, args = {}) => {
  const r = await mcp.callTool({ name, arguments: args });
  const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // a text answer
  }
  return { error: !!r.isError, text, json };
};
const must = async (name, args) => {
  const r = await call(name, args);
  if (r.error) throw new Error(`${name}: ${r.text}`);
  return r.json ?? r.text;
};

/** Evaluates in the preview frame that shows the fixture app (it is replaced when a scene mounts). */
const inFrame = async (js) => {
  for (const f of await browser.frames()) {
    try {
      const v = await f.ev(`(() => { if (!document.querySelector("app-todo-board, [data-gable-scene], h1.title")) return { __none: true }; ${js} })()`);
      if (!(v && v.__none)) return v;
    } catch {
      // a frame that went away
    }
  }
  return undefined;
};
const frameText = (selector) => inFrame(`return document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`);

const tab = (js) => q(`const t = document.querySelector("app-why-tab"); if (!t) return null; ${js}`);
const part = (name) => tab(`return t.querySelector('[data-part="${name}"]')?.textContent.replace(/\\s+/g, " ").trim() ?? null`);
const runs = () => tab(`return [...t.querySelectorAll('[data-part="why-run"]')].map((r) => r.textContent.replace(/\\s+/g, " ").trim())`);
const deps = () => tab(`return [...t.querySelectorAll('[data-part="why-dep"]')].map((r) => r.dataset.name)`);
const titles = () => tab(`return [...t.querySelectorAll('[data-part="why-title"]')].map((r) => r.textContent.trim())`);

try {
  await until(() => ev(`!!document.body?.innerText.includes("Connected")`), "the shell is connected", 90000);
  await must("show_component", { scenes: "/src/todo-board.scenes.ts", scene: "Empty" });
  await until(async () => (await frameText("h1.title")) === "Todos", "the frame shows the board");
  await until(async () => !(await call("select_element", { selector: "p.count" })).error, "the count paragraph can be selected", 20000);

  // --- the Why tab: p.count shows `{{ count() }} items`, count being a computed over items ------------------------------
  let clicks = 0;
  await until(async () => !!(await tab(`return !!t.querySelector('[data-part="why-node"]')`)) || ((clicks++ % 10 === 0 && (await q(`document.querySelector("#drawer-tab-why")?.click()`))), false), "the Why tab opens on the selection", 20000);
  check((await titles()).some((t) => /^text of <p/.test(t)), "the selected element's text binding is listed", (await titles()).join(", "));
  const d0 = await deps();
  check(d0.includes("count") && d0.includes("items"), "it shows the signals the binding depends on, through the computed (count, then items)", d0.join(", "));
  check((await runs()).some((r) => /^.*Created/.test(r)), "its first run is a creation, with no invented cause", (await runs()).join(" | "));

  // --- a write: the run's cause names the signal, the old and new value, and the computed between ------------------------
  await must("set_signal", { name: "items", value: JSON.stringify([{ id: 1, text: "Milk", done: false }]) });
  await until(async () => (await frameText("p.count")) === "1 items", "one item");
  await until(async () => (await runs()).some((r) => /Caused by/.test(r)), "the Why tab shows the cause of the update", 10000);
  const cause = (await runs()).find((r) => /Caused by/.test(r));
  check(/TodoBoard\.items/.test(cause) && /via count/.test(cause) && /written by the Designer/.test(cause), "the cause names the written signal, the computed it went through and who wrote it", cause);

  // --- Highlight updates: an outline on the canvas for the element that updated ---------------------------------------------
  await inFrame(`window.__flashes = 0; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.hasAttribute("data-gable-flash")) window.__flashes++; }).observe(document.documentElement, { childList: true, subtree: true }); return true`);
  await tab(`t.querySelector('[data-part="why-highlight"] input').click(); return true`);
  await until(async () => (await call("why_did_update", {})).json?.scope === "element", "the tool answers", 10000);
  await sleep(300);
  await must("set_signal", { name: "items", value: JSON.stringify([{ id: 1, text: "Milk", done: false }, { id: 2, text: "Eggs", done: true }]) });
  await until(async () => (await frameText("p.count")) === "2 items", "two items");
  await sleep(300);
  check((await inFrame(`return window.__flashes`)) >= 1, "Highlight updates outlines the updated element on the canvas", String(await inFrame(`return window.__flashes`)));
  if (arg("--shot")) {
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
  }

  // --- over MCP ------------------------------------------------------------------------------------------------------------
  const w = await must("why_did_update", {});
  const b = w.bindings?.find((x) => /^text of <p/.test(x.what));
  check(w.scope === "element" && w.component === "TodoBoard" && !!b, "why_did_update answers for the selected element", JSON.stringify(w).slice(0, 200));
  check(b?.dependsOn.some((x) => x.name === "count" && x.kind === "computed") && b.dependsOn.some((x) => x.name === "items"), "why_did_update lists the dependencies", JSON.stringify(b?.dependsOn.map((x) => x.name)));
  const last = b?.recent.at(-1);
  check(last && !last.first && last.causes[0]?.name === "items" && last.causes[0].via.includes("count") && last.causes[0].by === "designer", "why_did_update gives the cause of the last update", JSON.stringify(last));
  const comp = await must("why_did_update", { scope: "component" });
  check(comp.scope === "component" && comp.bindings.length >= w.bindings.length, "scope component lists the component's effects", String(comp.bindings.length));
  check((await must("highlight_updates", { on: false })).on === false, "highlight_updates turns the outline off");
  await until(async () => (await tab(`return t.querySelector('[data-part="why-highlight"] input')?.checked`)) === false, "the drawer follows the tool", 10000);
  check(true, "the drawer's switch follows highlight_updates");
  await must("select_element", { clear: true });
  const none = await call("why_did_update", {});
  check(none.error && /select/i.test(none.text), "with nothing selected the tool says to select an element", none.text);
} catch (error) {
  check(false, "the check ran to the end", error instanceof Error ? error.message : String(error));
  if (process.env.CHECK_VERBOSE) console.log("tab:", await tab("return t.innerText").catch((e) => e.message));
} finally {
  await mcp.close().catch(() => undefined);
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
