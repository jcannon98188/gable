// Driven check of the source writers (TASK-56.10): New Scenario and Extract component, end to end in a real browser.
// Self-contained: starts the built Designer on examples/todomvc and a headless Edge/Chromium with a debugging port, drives the
// dialogs through CDP, undoes both edits, and stops only the two process trees it started. The project's files are snapshot
// first and put back afterwards whatever happens.
//
//   npm run build -w packages/designer && node packages/designer/e2e/writers-check.mjs [--browser <path to msedge/chrome>]
//   node packages/designer/e2e/writers-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port>
//
// The second form drives a Designer that is already running on examples/todomvc (the Tauri/WebView2 window started with
// GABLE_CDP_PORT, say) and starts nothing.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, connectBrowser } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const project = join(repo, "examples", "todomvc");
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const browserPath =
  arg("--browser") ??
  [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find((p) => existsSync(p));

const attach = process.argv.includes("--port") ? { port: Number(arg("--port")), shell: arg("--shell", "127.0.0.1:5190") } : null;

let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

// --- snapshot of the project's sources ------------------------------------------------------------------------------
const src = join(project, "src");
const files = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
const snapshot = new Map(files(src).map((f) => [f, readFileSync(f, "utf8")]));
const restore = () => {
  const changed = [];
  for (const f of files(src)) {
    if (!snapshot.has(f)) (rmSync(f), changed.push(`removed ${relative(project, f)}`));
  }
  for (const [f, text] of snapshot) {
    if (!existsSync(f) || readFileSync(f, "utf8") !== text) (writeFileSync(f, text), changed.push(`restored ${relative(project, f)}`));
  }
  return changed;
};
const read = (rel) => readFileSync(join(project, rel), "utf8");
const scenesRel = "src/components/todo-item.scenes.ts";
const appRel = "src/components/todo-app.ts";
const createdRel = "src/components/app-title.ts";

// --- processes we start, and only those are stopped ------------------------------------------------------------------
const started = [];
const stopTree = (child) => {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
};

let page = null;
let browser = null;
const profile = mkdtempSync(join(tmpdir(), "gable-writers-edge-"));
try {
  if (attach) {
    page = await connect(attach.port, attach.shell);
    browser = await connectBrowser(attach.port);
  } else {
    if (!browserPath) throw new Error("No Edge or Chromium found: pass --browser <path>.");
    const designerPort = await freePort();
    const designer = spawn(process.execPath, [join(here, "..", "dist", "server", "cli.js"), project, "--port", String(designerPort)], { stdio: ["ignore", "pipe", "pipe"] });
    started.push(designer);
    let log = "";
    designer.stderr.on("data", (d) => (log += d));
    const ready = await new Promise((ok, fail) => {
      let out = "";
      designer.stdout.on("data", (d) => {
        out += d;
        const m = /GABLE_DESIGNER_READY (\{.*\})/.exec(out);
        if (m) ok(JSON.parse(m[1]));
      });
      designer.once("exit", (code) => fail(new Error(`the Designer exited (${code}): ${log.slice(-800)}`)));
    });
    const cdpPort = await freePort();
    const edge = spawn(browserPath, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1600,1000", ready.url + "/"], { stdio: "ignore" });
    started.push(edge);
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) break;
      } catch {
        // not up yet
      }
      await sleep(150);
    }
    await sleep(500);
    page = await connect(cdpPort, `127.0.0.1:${designerPort}`);
    browser = await connectBrowser(cdpPort);
  }
  const { ev, until, cdp } = page;
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
  const dialogText = () => ev(`[...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText).join(" ")`);
  const type = async (part, text) => {
    await ev(`(() => { const el = document.querySelector('[data-part="${part}"]'); el.focus(); el.select?.(); })()`);
    await cdp("Input.insertText", { text });
    await sleep(150);
  };
  const click = (part) => ev(`document.querySelector('[data-part="${part}"]').click()`);
  /** Closed dialogs keep their content in the DOM: open means visible. */
  const visible = (part) => ev(`document.querySelector('[data-part="${part}"]')?.checkVisibility() === true`);
  const disabled = (part) => ev(`document.querySelector('[data-part="${part}"]')?.disabled === true`);
  const sceneRows = () => ev(`[...document.querySelectorAll(".tr.scene")].map((b) => b.innerText.replace(/\\s+/g, " ").trim())`);
  /** Clicks an element of the selected frame's page, found by a selector inside it (select mode picks it). */
  const pick = async (selector) => {
    const frame = await until(async () => (await browser.frames()).find((f) => f.url.includes("localhost")), "the preview frame");
    await until(() => frame.ev(`!!document.querySelector(${JSON.stringify(selector)})`), `${selector} in the frame`);
    // A point the element itself is hit at: with todos listed, todomvc's toggle-all label covers the input's left end.
    const inner = await frame.ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); const y = r.y + r.height / 2; return [r.x + Math.min(r.width / 2, 20), r.x + r.width / 2].map((x) => ({ x, y })).find((p) => el.contains(document.elementFromPoint(p.x, p.y))) ?? { x: r.x + r.width / 2, y }; })()`);
    const outer = await ev(`(() => { const f = document.querySelector("app-frame-view iframe"); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, scale: r.width / f.offsetWidth }; })()`);
    const x = outer.x + inner.x * outer.scale;
    const y = outer.y + inner.y * outer.scale;
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(80);
    for (const t of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type: t, x, y, button: "left", clickCount: 1 });
  };

  await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 90000);
  await sleep(800);

  // --- New Scenario -------------------------------------------------------------------------------------------------------
  await palette(`Go to /${scenesRel}`);
  await until(async () => (await sceneRows()).some((r) => r.startsWith("Active")), "todo-item's Scenarios are listed", 30000);
  const before = await sceneRows();
  await palette("New Scenario");
  await until(() => visible("scenario-name"), "the New Scenario dialog");
  check(await disabled("scenario-submit"), "Create is disabled until the Scenario has a name");
  await type("scenario-name", "Active");
  check((await dialogText()).includes('already a Scenario called "Active"') && (await disabled("scenario-submit")), "a taken name is refused before anything is written");
  await type("scenario-name", "Check copy");
  await type("scenario-description", "Written by the check");
  const from = await ev(`document.querySelector('[data-part="scenario-from"]').value`);
  check(from === "Active", "it starts from the Scenario on the canvas", from);
  await click("scenario-submit");
  await until(async () => (await sceneRows()).some((r) => r.startsWith("Check copy")), "the new Scenario appears in the list", 20000);
  await until(() => visible("scenario-name").then((v) => !v), "the dialog closes", 6000).catch(() => null);
  check(!(await visible("scenario-name")), "the dialog closes after the Scenario is written");
  const rows = await sceneRows();
  check(rows.length === before.length + 1 && rows.at(-1).startsWith("Check copy"), "the new Scenario is listed last", rows.join(" | "));
  await until(async () => (await sceneRows()).some((r) => r.startsWith("Check copy") && r.includes("active")), "the new Scenario is mounted", 10000).catch(() => null);
  check((await sceneRows()).some((r) => r.startsWith("Check copy") && r.includes("active")), "the new Scenario is mounted on the canvas");
  const written = read(scenesRel);
  check(
    written.includes(`    'Check copy': { description: 'Written by the check', inputs: { todo: { id: '1', title: 'Buy milk', completed: false } }, providers },\n  },`),
    "the scenes file got one scene, copied from Active, as a minimal insertion",
  );
  check(written.replace(/\n {4}'Check copy'.*,(?=\n {2}\},)/, "") === snapshot.get(join(project, scenesRel)), "nothing else in the scenes file changed");
  await ev(`document.activeElement?.blur?.()`);
  await key("z", "KeyZ", 90, 2);
  await until(() => read(scenesRel) === snapshot.get(join(project, scenesRel)), "undo restores the scenes file", 10000).catch(() => null);
  check(read(scenesRel) === snapshot.get(join(project, scenesRel)), "undo restores the scenes file byte for byte");
  await until(async () => !(await sceneRows()).some((r) => r.startsWith("Check copy")), "the Scenario leaves the list", 15000).catch(() => null);
  check(!(await sceneRows()).some((r) => r.startsWith("Check copy")), "after undo the Scenario is gone from the list");

  // --- Extract component ----------------------------------------------------------------------------------------------
  await palette("Switch to Page mode");
  await until(() => ev(`document.body.innerText.includes("Connected")`), "page mode is connected", 60000);
  await sleep(1500);
  await pick("input.new-todo");
  await until(() => ev(`!!document.querySelector("[data-control]")`), "the input is selected", 15000).catch(() => null);
  await sleep(600);
  await palette("Extract to component");
  await until(() => visible("extract-name"), "the Extract dialog");
  await type("extract-name", "NewTodo");
  await until(() => ev(`!!document.querySelector('[data-part="extract-why"]')`), "a reason", 5000).catch(() => null);
  const why = await ev(`document.querySelector('[data-part="extract-why"]')?.innerText ?? ""`);
  check(/static markup/.test(why) && (await disabled("extract-submit")), "dynamic markup cannot be extracted, and the dialog says why", why);
  await key("Escape", "Escape", 27);
  await sleep(400);

  await pick("header h1");
  await sleep(1200);
  await palette("Extract to component");
  await until(() => visible("extract-name"), "the Extract dialog");
  await type("extract-name", "AppTitle");
  const shown = await ev(`document.querySelector('[data-part="extract-file"]').innerText`);
  check(shown === createdRel, "the dialog shows the file it will create", shown);
  await until(async () => !(await disabled("extract-submit")), "Extract is enabled for static markup", 5000).catch(() => null);
  check(!(await disabled("extract-submit")), "Extract is enabled for static markup");
  await click("extract-submit");
  await until(() => existsSync(join(project, createdRel)), "the component file is created", 10000).catch(() => null);
  check(existsSync(join(project, createdRel)), "the component file is created");
  const created = existsSync(join(project, createdRel)) ? read(createdRel) : "";
  check(created.includes("export class AppTitle") && created.includes("selector: 'app-title'") && created.includes("<h1>todos</h1>"), "it holds the markup as a component", created.split("\n").length + " lines");
  const app = read(appRel);
  check(app.includes("<app-title></app-title>") && !app.includes("<h1>todos</h1>"), "the source uses the component in place");
  check(app.includes("import { AppTitle } from './app-title.js';") && app.includes("imports: [TodoItem, AppTitle],"), "the class is imported and listed in imports");
  const frame = (await browser.frames()).find((f) => f.url.includes("localhost"));
  await until(() => frame.ev(`document.querySelector("app-title h1")?.textContent === "todos"`), "the canvas renders the new component", 15000).catch(() => null);
  check(await frame.ev(`document.querySelector("app-title h1")?.textContent === "todos"`), "the canvas renders the extracted component after HMR");
  // The dialog closes once the edit settles: after the hot update, when the same element is selected again.
  await until(() => visible("extract-name").then((v) => !v), "the dialog closes", 6000).catch(() => null);
  check(!(await visible("extract-name")), "the dialog closes after a successful extract");

  await ev(`document.activeElement?.blur?.()`);
  await key("z", "KeyZ", 90, 2);
  await until(() => !existsSync(join(project, createdRel)) && read(appRel) === snapshot.get(join(project, appRel)), "undo", 10000).catch(() => null);
  check(read(appRel) === snapshot.get(join(project, appRel)), "undo restores the source byte for byte");
  check(!existsSync(join(project, createdRel)), "undo removes the created component file");
  await until(() => frame.ev(`document.querySelector("header h1")?.textContent === "todos" && !document.querySelector("app-title")`), "the canvas is back", 15000).catch(() => null);
  check(await frame.ev(`document.querySelector("header h1")?.textContent === "todos" && !document.querySelector("app-title")`), "the canvas shows the original markup again");
} catch (e) {
  failed++;
  console.log(`FAIL  ${e instanceof Error ? e.message : e}`);
  const shown = await page?.ev(`document.body.innerText`).catch(() => null);
  if (shown) console.log(`      the shell shows: ${shown.replace(/\s+/g, " ").slice(0, 400)}`);
} finally {
  page?.close();
  browser?.close();
  for (const child of started.reverse()) stopTree(child);
  await sleep(500);
  const changed = restore();
  check(changed.length === 0, "the project is left as it was", changed.join(", "));
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // the browser may still hold its profile for a moment
  }
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
