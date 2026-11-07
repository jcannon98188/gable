// Driven check of signal state editing (TASK-56.17): in the Inspector, Edit sets a signal of the running app and the frame
// updates; a value of the wrong shape is refused with the reasons, then written on "Set anyway"; a pin holds against the app
// until the app fights it, then is suspended with the reason; a child's poked signal is listed as not saveable; "Save as
// Scenario" writes a scene into the scenes file that mounts with the saved state, and undo takes it back. Then the same over
// MCP: set_signal, pin_signal, get_scene_state and save_scenario.
//
//   npm run build -w packages/designer && node packages/designer/e2e/state-check.mjs [--browser <path>] [--shot <file>]
//
// It runs against test-fixtures/state-app and restores its scenes file byte for byte afterwards (failing if it could not).
// It starts the backend and a headless Edge, and stops exactly the processes it started (each by its PID, with its own
// child tree), nothing else.
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
const project = join(here, "..", "test-fixtures", "state-app");
const scenesFile = join(project, "src", "todo-board.scenes.ts");
const original = readFileSync(scenesFile, "utf8");

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
  profile = mkdtempSync(join(tmpdir(), "gable-state-check-"));
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

const mcp = new Client({ name: "state-check", version: "1" });
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

/** The Inspector's row for a signal or input named `name`. */
const row = (name) => `[...document.querySelectorAll("app-inspector .inj-row")].find((r) => r.querySelector('[data-part="signal-edit"]')?.getAttribute("aria-label") === ${JSON.stringify(`Edit ${name}`)})`;
const openEditor = async (name) => {
  await until(() => q(`return !!${row(name)}`), `the Inspector lists ${name} with an Edit button`);
  // The row may be re-rendered while the click's read is in flight (a flush right after a scene mounts): click until it opens.
  let clicked = 0;
  await until(async () => {
    if (await q(`return !!${row(name)}?.querySelector('[data-part="signal-text"]')`)) return true;
    if (clicked++ % 10 === 0) await q(`${row(name)}?.querySelector('[data-part="signal-edit"]').click()`);
    return false;
  }, `the editor for ${name} opens`);
  const text = await q(`return ${row(name)}?.querySelector('[data-part="signal-text"]')?.value ?? null`);
  if (text === null) {
    throw new Error(`the editor for ${name} closed by itself (${await q(`return document.querySelector("app-inspector .sec-h")?.textContent.trim()`)})`);
  }
  return text;
};
const typeValue = (name, text) => q(`const t = ${row(name)}.querySelector('[data-part="signal-text"]'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event("input", { bubbles: true }))`);
const press = (name, part) => q(`${row(name)}.querySelector('[data-part="${part}"]').click()`);
const editorState = (name) =>
  q(`const r = ${row(name)}; return r && { open: !!r.querySelector('[data-part="signal-editor"]'), error: r.querySelector('[data-part="signal-error"]')?.textContent.trim() ?? "", problems: [...r.querySelectorAll('[data-part="signal-problem"]')].map((p) => p.textContent.trim()), set: r.querySelector('[data-part="signal-set"]')?.textContent.trim() ?? "", pinned: r.querySelector('[data-part="signal-pinned"]')?.textContent.trim() ?? null, pinTitle: r.querySelector('[data-part="signal-pinned"]')?.getAttribute("title") ?? null }`);

try {
  await until(() => ev(`!!document.body?.innerText.includes("Connected")`), "the shell is connected", 90000);

  // --- component mode on the Empty scene; pick the board's title so the Inspector shows TodoBoard ---------------------
  const shown = await must("show_component", { scenes: "/src/todo-board.scenes.ts", scene: "Empty" });
  check(shown.scene === "Empty", "show_component mounts the Empty scene");
  await until(async () => (await frameText("h1.title")) === "Todos", "the frame shows the board");
  await until(async () => !(await call("select_element", { selector: "h1.title" })).error, "the title can be selected", 20000);
  await until(async () => (await q(`return !!document.querySelector("app-inspector .sec-h")`)) || (await q(`[...document.querySelectorAll('[data-part="trigger"]')].find((t) => t.textContent.trim() === "Inspector")?.click(); return false`)), "the Inspector tab opens", 20000);
  await until(() => q(`return document.querySelector("app-inspector .sec-h")?.textContent.includes("TodoBoard")`), "the Inspector shows TodoBoard");
  const editable = await q(`return [...document.querySelectorAll('app-inspector [data-part="signal-edit"]')].map((b) => b.getAttribute("aria-label"))`);
  check(["Edit items", "Edit ticks", "Edit title"].every((l) => editable.includes(l)) && !editable.includes("Edit count"), "writable signals and inputs have Edit, the computed does not", editable.join(", "));

  // --- Edit: the current value is the starting text; Set writes it and the frame updates -----------------------------
  check((await openEditor("items")) === "[]", "the editor starts from the current value as JSON");
  const items = [{ id: 1, text: "Milk", done: false }, { id: 2, text: "Eggs", done: true }];
  await typeValue("items", JSON.stringify(items));
  await press("items", "signal-set");
  await until(async () => (await frameText("p.count")) === "2 items", "the frame shows the two items", 10000);
  check((await inFrame(`return [...document.querySelectorAll("ul.items li")].map((l) => l.textContent.trim()).join(",")`)) === "Milk,Eggs", "Set writes the signal and the frame re-renders");
  await until(async () => !(await editorState("items")).open, "the editor closes after a write");
  check(true, "the editor closes after a write");

  // --- the shape check: refused with reasons, then "Set anyway" ------------------------------------------------------
  await openEditor("items");
  await typeValue("items", `[{"id":3,"label":"Bread"}]`);
  await press("items", "signal-set");
  await until(async () => (await editorState("items")).problems.length > 0, "the shape problems are listed");
  const refused = await editorState("items");
  check(refused.problems.includes("value[0].text is missing.") && refused.problems.includes("value[0].label is new.") && refused.set === "Set anyway", "a value of another shape is refused with the reasons, offering Set anyway", refused.problems.join(" | "));
  check((await frameText("p.count")) === "2 items", "the refused value was not written");
  await press("items", "signal-set");
  await until(async () => (await frameText("p.count")) === "1 items", "Set anyway writes it", 10000);
  await until(async () => !(await editorState("items")).open, "the editor closes after Set anyway");
  check(true, "Set anyway writes the value of the other shape");
  await openEditor("items");
  await typeValue("items", "[1,");
  await press("items", "signal-set");
  await until(async () => (await editorState("items")).error !== "", "invalid JSON is refused");
  check((await editorState("items")).error.startsWith("Not valid JSON"), "text that is not JSON is refused", (await editorState("items")).error);
  await typeValue("items", JSON.stringify(items));
  await q(`${row("items")}.querySelector('[data-part="signal-set"]').click()`);
  await until(async () => (await frameText("p.count")) === "2 items", "the items are back", 10000);
  await until(async () => !(await editorState("items")).open, "the editor closes");

  // --- a value that is not plain data: the editor says so ------------------------------------------------------------
  // createdAt holds a Date: listed among the signals, writable, but its text cannot be checked.
  await openEditor("createdAt");
  const dateState = await editorState("createdAt");
  check(/not plain data|Date/.test(dateState.error), "a signal holding a Date says why it cannot be edited as JSON", dateState.error);
  await q(`${row("createdAt")}.querySelectorAll('[data-part="signal-editor"] button')[2].click()`);

  // --- Pin: written now and again after the app writes; fought too often, it is suspended -----------------------------
  await openEditor("ticks");
  await typeValue("ticks", "7");
  await press("ticks", "signal-pin");
  await until(async () => (await editorState("ticks"))?.pinned === "pinned 7", "the pin chip shows");
  await until(async () => (await frameText("p.ticks")) === "ticks 7", "the pinned value shows in the frame");
  check(true, "a pin writes the value and shows a chip");
  // One write by the app (a single tick) is put back by the pin.
  await must("set_mode", { mode: "interact" });
  await inFrame(`document.querySelector("button.burst").click(); return true`);
  await until(async () => (await editorState("ticks"))?.pinned === "pin suspended", "the fought pin is suspended", 10000);
  const suspended = await editorState("ticks");
  check(/overwrote it more than 20 times/.test(suspended.pinTitle ?? ""), "the app fighting the pin suspends it, with the reason", suspended.pinTitle);
  await sleep(1300);
  check((await frameText("p.ticks")) !== "ticks 7", "a suspended pin no longer writes", await frameText("p.ticks"));
  await must("set_mode", { mode: "select" });
  await press("ticks", "signal-unpin");
  await until(async () => (await editorState("ticks"))?.pinned === null, "Unpin removes the pin");
  check(true, "Unpin removes the pin");

  // A pin that holds: pin again; the app's first ticks are put back before the burst suspends it.
  await openEditor("ticks");
  await typeValue("ticks", "5");
  await press("ticks", "signal-pin");
  await until(async () => (await frameText("p.ticks")) === "ticks 5", "pinned to 5");
  await must("set_mode", { mode: "interact" });
  await inFrame(`document.querySelector("button.burst").click(); return true`);
  await sleep(40);
  check((await frameText("p.ticks")) === "ticks 5", "the pin puts its value back after the app writes", await frameText("p.ticks"));
  await until(async () => (await editorState("ticks"))?.pinned === "pin suspended", "the burst suspends it again", 10000);
  await must("set_mode", { mode: "select" });
  await press("ticks", "signal-unpin");
  await until(async () => (await editorState("ticks"))?.pinned === null, "unpinned");

  // --- a child's signal is poked: listed as not saveable ---------------------------------------------------------------
  const tree = await must("get_tree", {});
  const badge = /TodoBadge <app-todo-badge> id=(\S+)/.exec(String(tree))?.[1];
  check(!!badge, "get_tree lists the child TodoBadge", badge);
  if (badge) {
    await must("set_signal", { component: badge, name: "open", value: "true" });
    await until(async () => (await frameText("span.badge")) === "open", "the child's signal is set");
  }
  await until(() => q(`return !!document.querySelector('[data-part="scene-state-skipped"]')`), "the skipped callout shows");
  const skipped = await q(`return document.querySelector('[data-part="scene-state-skipped"]').textContent.trim()`);
  check(/open \(TodoBadge\) is not saved: It belongs to TodoBadge, not TodoBoard/.test(skipped), "a child's poked signal is listed as not saveable, with why", skipped);

  // --- Poked state lists what was set; Save as Scenario writes a scene that mounts with it ---------------------------
  await until(() => q(`return !!document.querySelector('[data-part="scene-state"] ui-checkbox[data-field="items"]')`), "the Poked state section lists items");
  const fields = await q(`return [...document.querySelectorAll('[data-part="scene-state"] ui-checkbox')].map((c) => c.dataset.field)`);
  check(fields.includes("items") && fields.includes("ticks") && !fields.includes("createdAt"), "Poked state lists the fields set from the Designer", fields.join(", "));
  // Keep items only: untick ticks.
  await q(`document.querySelector('[data-part="scene-state"] ui-checkbox[data-field="ticks"] input').click()`);
  await q(`const i = document.querySelector('[data-part="scene-state-name"]'); i.value = "Shopping"; i.dispatchEvent(new Event("input", { bubbles: true }))`);
  await until(() => q(`return !document.querySelector('[data-part="scene-state-save"]').disabled`), "Save is enabled");
  await q(`document.querySelector('[data-part="scene-state-save"]').click()`);
  await until(() => readFileSync(scenesFile, "utf8").includes("Shopping"), "the scenes file gets the new scene", 15000);
  const written = readFileSync(scenesFile, "utf8");
  // A copy of Empty without its description ("Nothing to do" no longer holds), with the chosen state.
  const expected = `    Shopping: { state: { items: [{ id: 1, text: "Milk", done: false }, { id: 2, text: "Eggs", done: true }] } },`;
  check(written.includes(expected), "Save as Scenario writes the chosen state into a copy of the scene", written.split("\n").find((l) => l.includes("Shopping")));
  check(written.replace(`${expected}\n`, "") === original, "the edit is minimal: one added line");
  await until(() => q(`return document.body.innerText.includes("Shopping")`), "the shell lists the new scene", 15000);
  await until(async () => (await must("get_scene_state", {})).scene === "Shopping", "the new scene is mounted", 15000);
  await until(async () => (await frameText("p.count")) === "2 items", "the saved scene mounts with its state", 10000);
  check((await frameText("p.ticks")) === "ticks 0" && (await frameText("span.badge")) === "closed", "the scene holds only the chosen state");

  // --- undo takes the scene back ---------------------------------------------------------------------------------------
  await must("undo", {});
  check(readFileSync(scenesFile, "utf8") === original, "undo restores the scenes file byte for byte");

  // --- the same over MCP -----------------------------------------------------------------------------------------------
  await must("show_component", { scenes: "/src/todo-board.scenes.ts", scene: "Titled" });
  await until(async () => (await frameText("h1.title")) === "Groceries", "the Titled scene mounts");
  const wrong = await call("set_signal", { name: "items", value: "3" });
  check(wrong.error && /value was an array, not a number[\s\S]*force: true/.test(wrong.text), "set_signal refuses a value of another shape, with the reasons", wrong.text.split("\n")[1]);
  await must("set_signal", { name: "items", value: JSON.stringify([{ id: 9, text: "Tea", done: false }]) });
  await until(async () => (await frameText("p.count")) === "1 items", "set_signal writes the running app", 10000);
  check(true, "set_signal writes by field name and the frame updates");
  await must("set_signal", { name: "title", value: '"Pantry"' });
  await until(async () => (await frameText("h1.title")) === "Pantry", "set_signal writes an input");
  check(true, "set_signal writes an input");
  const pinned = await must("pin_signal", { name: "ticks", value: "4" });
  check(pinned.pins?.[0]?.status === "active" && pinned.pins[0].text === "4", "pin_signal pins and answers with the pins", JSON.stringify(pinned.pins));
  check((await must("pin_signal", { name: "ticks", value: null })).pins.length === 0, "pin_signal with null unpins");
  const report = await must("get_scene_state", {});
  check(report.component === "TodoBoard" && report.scene === "Titled" && report.wouldSave.join(",") === "title,items,ticks", "get_scene_state reports the poked fields", report.wouldSave.join(","));
  const saved = await must("save_scenario", { name: "Pantry", fields: ["title", "items"] });
  check(saved.diff.includes(`+    Pantry: {`) && saved.diff.includes(`inputs: { title: "Pantry" }`) && saved.diff.includes(`state: { items: [{ id: 9, text: "Tea", done: false }] }`) && saved.shown, "save_scenario writes the scene, answers with the diff and shows it", saved.diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join(" "));
  await until(async () => (await frameText("h1.title")) === "Pantry" && (await frameText("p.count")) === "1 items", "the saved scene mounts with its inputs and state", 10000);
  check(true, "the scene saved over MCP mounts with its inputs and state");
  await must("undo", {});
  check(readFileSync(scenesFile, "utf8") === original, "undo restores the scenes file again");

  if (arg("--shot")) {
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
  }
} catch (error) {
  check(false, "the check ran to the end", error instanceof Error ? error.message : String(error));
} finally {
  await mcp.close().catch(() => undefined);
  if (readFileSync(scenesFile, "utf8") !== original) writeFileSync(scenesFile, original);
  check(readFileSync(scenesFile, "utf8") === original, "the fixture's scenes file is restored");
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
