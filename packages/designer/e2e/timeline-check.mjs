// Driven check of signal time travel (TASK-56.18): the State timeline in the drawer lists the frame's recorded steps (the
// app's own writes and the Designer's), the start row, the slider and a row put the app back to an earlier state and the frame
// shows it, Replay steps forward and stops, Live returns, Pause stops recording, Clear forgets. Then the same over MCP:
// get_signal_history, travel_signal_history, record_signal_history and clear_signal_history.
//
//   npm run build -w packages/designer && node packages/designer/e2e/timeline-check.mjs [--browser <path>] [--shot <file>] [--shot-timeline <file>]
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
  profile = mkdtempSync(join(tmpdir(), "gable-timeline-check-"));
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

const mcp = new Client({ name: "timeline-check", version: "1" });
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

const tab = (js) => q(`const t = document.querySelector("app-signal-timeline"); if (!t) return null; ${js}`);
const rows = () => tab(`return [...t.querySelectorAll('[data-part="history-step"]')].map((r) => ({ seq: Number(r.dataset.seq), current: r.dataset.current === "true", text: r.textContent.replace(/\\s+/g, " ").trim(), title: r.querySelector("[title]")?.getAttribute("title") ?? "" }))`);
const part = (name) => tab(`return t.querySelector('[data-part="${name}"]')?.textContent.trim() ?? null`);
const press = (name) => tab(`t.querySelector('[data-part="${name}"]').click(); return true`);
const frameState = async () => `${await frameText("p.count")} / ${await frameText("p.ticks")}`;
/** An arrow key on the slider's focused thumb, as a keyboard user scrubs. */
const key = async (k, vk) => {
  await tab(`t.querySelector('[data-part="history-scrub"] [role="slider"]').focus(); return true`);
  await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: vk });
  await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: vk });
};

try {
  await until(() => ev(`!!document.body?.innerText.includes("Connected")`), "the shell is connected", 90000);

  // --- component mode on the Empty scene, an empty history -------------------------------------------------------------
  await must("show_component", { scenes: "/src/todo-board.scenes.ts", scene: "Empty" });
  await until(async () => (await frameText("h1.title")) === "Todos", "the frame shows the board");
  await until(async () => (await call("get_signal_history", {})).json?.recording === true, "the agent turned recording on", 20000);
  await must("clear_signal_history", {});
  // The tab may not be rendered yet when the drawer restores its layout: click until the State timeline shows.
  let clicks = 0;
  await until(async () => (await tab(`return !!t.querySelector(".empty")`)) || ((clicks++ % 10 === 0 && (await q(`document.querySelector("#drawer-tab-state")?.click()`))), false), "the State timeline tab opens empty");
  check(/No state changes recorded yet/.test(await tab(`return t.querySelector(".empty").textContent`)), "the State timeline sits in the drawer and says when nothing is recorded");

  // --- record: two Designer writes, then the app's own: 100 ticks -------------------------------------------------------
  await must("set_signal", { name: "items", value: JSON.stringify([{ id: 1, text: "Milk", done: false }]) });
  await until(async () => (await frameText("p.count")) === "1 items", "one item");
  await must("set_signal", { name: "items", value: JSON.stringify([{ id: 1, text: "Milk", done: false }, { id: 2, text: "Eggs", done: true }]) });
  await until(async () => (await frameText("p.count")) === "2 items", "two items");
  await must("set_mode", { mode: "interact" });
  await inFrame(`document.querySelector("button.burst").click(); return true`);
  await until(async () => (await frameText("p.ticks")) === "ticks 100", "the burst ends at 100 ticks", 15000);
  // One step per task: each tick is its own task, but two that run back to back before the step commits share it.
  await until(async () => /→ 100/.test((await rows())?.[0]?.text ?? ""), "the timeline lists the last tick", 10000);
  const listed = await rows();
  const steps = listed.length;
  const history = await must("get_signal_history", { limit: 300 });
  const ticks = history.steps.filter((x) => x.source === "app");
  const chained = ticks.every((x, i) => x.writes.length === 1 && x.writes[0].name === "ticks" && x.writes[0].before === (i === 0 ? "0" : ticks[i - 1].writes[0].after));
  check(steps === history.total && steps >= 92 && steps <= 102 && chained && ticks.at(-1).writes[0].after === "100", "every write is recorded: 2 Designer steps and the 100 ticks, each step's before the previous one's after", `${steps} steps`);
  check(listed[0].current && /ticks \d+ → 100/.test(listed[0].text) && listed.filter((r) => r.current).length === 1, "newest first, the newest marked as shown", listed[0].text);
  check(listed.slice(-2).every((r) => /Designer/.test(r.text) && /items/.test(r.text)), "the Designer's writes are marked Designer", listed.at(-1).text);
  check(new RegExp(`^${steps} steps, ${steps} writes`).test(await part("history-summary")), "the summary counts steps and writes", await part("history-summary"));
  check((await part("history-position")) === `step ${listed[0].seq} (live)`, "the slider sits at the newest state", await part("history-position"));

  // --- travel: the start row, the slider, a row ------------------------------------------------------------------------
  await press("history-start");
  await until(async () => (await frameState()) === "0 items / ticks 0", "the start row puts the app back to before the first step", 10000);
  check(true, "the start row puts the app back to the state before the first step (0 items, ticks 0)");
  await until(async () => (await part("history-position")) === "start", "the slider follows to the start");
  check(!(await tab(`return !!t.querySelector('[data-part="history-note"]')`)), "a complete travel leaves no note");
  await key("ArrowRight", 39);
  await key("ArrowRight", 39);
  await until(async () => (await frameState()) === "2 items / ticks 0", "two slider steps right show the second Designer write", 10000);
  check((await part("history-position")) === `step ${listed.at(-2).seq}`, "scrubbing the slider travels the frame", await part("history-position"));
  const mid = ticks[Math.floor(ticks.length / 2)];
  const midTicks = mid.writes[0].after;
  await tab(`t.querySelector('[data-part="history-step"][data-seq="${mid.step}"]').click(); return true`);
  await until(async () => (await frameState()) === `2 items / ticks ${midTicks}`, "a row travels to its step", 10000);
  check(true, `a row travels the frame to its step (ticks ${midTicks})`);
  if (arg("--shot-timeline")) {
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot-timeline"), Buffer.from(data, "base64"));
  }
  check((await rows()).find((r) => r.current)?.seq === mid.step, "the travelled-to row is marked as shown");
  check((await rows()).length === steps, "travelling records no new steps");

  // --- replay forward from there, stop; Live ---------------------------------------------------------------------------
  await press("history-replay");
  await until(async () => (await part("history-replay")) === "Stop", "Replay runs");
  await until(async () => Number((await frameText("p.ticks")).split(" ")[1]) >= Number(midTicks) + 2, "Replay steps forward", 10000);
  await press("history-replay");
  await until(async () => (await part("history-replay")) === "Replay", "Stop ends the replay");
  const stoppedAt = await frameText("p.ticks");
  await sleep(1200);
  check((await frameText("p.ticks")) === stoppedAt && Number(stoppedAt.split(" ")[1]) < 100, "Replay steps forward one state at a time, and Stop holds the frame there", stoppedAt);
  await press("history-live");
  await until(async () => (await frameState()) === "2 items / ticks 100", "Live returns to the newest state", 10000);
  await until(async () => (await part("history-position"))?.endsWith("(live)"), "the slider is live again");
  check(true, "Live returns the frame to the newest state");

  // --- pause, clear ----------------------------------------------------------------------------------------------------
  await press("history-record");
  await until(async () => (await part("history-record")) === "Record", "Pause stops recording");
  check(!!(await part("history-paused")), "a paused timeline says so");
  await inFrame(`document.querySelector("button.burst").click(); return true`);
  await until(async () => (await frameText("p.ticks")) === "ticks 200", "the second burst ends", 15000);
  await sleep(400);
  check((await rows()).length === steps, "while paused, the app's writes are not recorded", `${(await rows()).length} rows`);
  await press("history-record");
  await until(async () => (await part("history-record")) === "Pause", "Record resumes");
  await press("history-clear");
  await until(() => tab(`return !!t.querySelector(".empty")`), "Clear empties the timeline");
  check((await frameState()) === "2 items / ticks 200", "Clear keeps the app's current state");
  await must("set_mode", { mode: "select" });

  // --- over MCP ----------------------------------------------------------------------------------------------------------
  for (const n of [1, 2, 3]) await must("set_signal", { name: "ticks", value: String(n) });
  await until(async () => (await frameText("p.ticks")) === "ticks 3", "ticks 3");
  const h = await must("get_signal_history", { limit: 2 });
  check(h.total === 3 && h.steps.length === 2 && h.omitted === 1 && h.shown === "live" && h.steps[1].source === "designer" && h.steps[1].writes[0].name === "ticks" && h.steps[1].writes[0].before === "2" && h.steps[1].writes[0].after === "3", "get_signal_history answers the newest steps with before and after", JSON.stringify(h.steps[1]));
  const back = await must("travel_signal_history", { to: "start" });
  await until(async () => (await frameText("p.ticks")) === "ticks 200", "travel_signal_history start", 10000);
  check(back.ok && back.shown === "start" && back.applied === 1, "travel_signal_history goes to the start and the frame shows it", JSON.stringify(back));
  await must("travel_signal_history", { to: h.steps[0].step });
  await until(async () => (await frameText("p.ticks")) === "ticks 2", "travel_signal_history to a step", 10000);
  await until(async () => (await rows()).find((r) => r.current)?.seq === h.steps[0].step, "the drawer follows an MCP travel");
  check(true, "an MCP travel shows in the drawer");
  const refused = await call("travel_signal_history", { to: 999 });
  check(refused.error && /No step 999/.test(refused.text), "travel_signal_history refuses a step it does not hold", refused.text);
  await must("travel_signal_history", { to: "live" });
  await until(async () => (await frameText("p.ticks")) === "ticks 3", "travel_signal_history live", 10000);
  check(true, "travel_signal_history returns live");
  check((await must("record_signal_history", { on: false })).recording === false && (await must("record_signal_history", { on: true })).recording === true, "record_signal_history pauses and resumes");
  check((await must("clear_signal_history", {})).total === 0, "clear_signal_history forgets the steps");

  if (arg("--shot")) {
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
  }
} catch (error) {
  check(false, "the check ran to the end", error instanceof Error ? error.message : String(error));
  if (process.env.CHECK_VERBOSE) {
    console.log("history:", (await call("get_signal_history", { limit: 5 }).catch(() => null))?.text);
    console.log("tab:", await tab("return t.innerText").catch((e) => e.message));
  }
} finally {
  await mcp.close().catch(() => undefined);
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
