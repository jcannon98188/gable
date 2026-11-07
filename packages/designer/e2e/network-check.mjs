// Driven check of the drawer's Network panel (TASK-56.20): the frame's real requests are logged; recording keeps real
// responses across a reload and saves them as a Scenario written into the scenes file (undo restores it byte for byte);
// under that Scenario the app is answered by the mocks, not the server; a mock is edited and removed in place; the slow,
// error and offline conditions apply to the page's requests (and whole-frame offline over CDP to everything); and the MCP
// tools do the same.
//
//   npm run build -w packages/designer && node packages/designer/e2e/network-check.mjs [--browser <path>] [--shot <file>]
//   node packages/designer/e2e/network-check.mjs --no-cdp     # a backend without CDP: whole-frame offline is unavailable
//
// It runs against test-fixtures/net-app, whose dev server serves a small real API (api/users.json), and writes only
// src/net-app.scenes.ts, through the Designer; the file must be byte-identical at the end (it is put back if not, and the
// check fails). It starts the backend with --cdp-port and a headless Edge on that port, and stops exactly the processes it
// started (each by its PID, with its own child tree), nothing else.
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
const project = join(here, "..", "test-fixtures", "net-app");
const scenesFile = join(project, "src", "net-app.scenes.ts");
const original = readFileSync(scenesFile, "utf8");
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
  profile = mkdtempSync(join(tmpdir(), "gable-net-check-"));
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
/** How many requests really reached the fixture's API (its own counter, read from outside the browser). */
const hits = async () => (await (await fetch(new URL("/api/hits", target.ready.previewUrl))).json());
/** The Network panel's request log: one array of cell texts per row. */
const logRows = () =>
  q(`return [...document.querySelectorAll('[data-part="net-log"] [role="row"]')].filter((r) => r.getAttribute("aria-rowindex") !== "1").map((r) => [...r.querySelectorAll('[role="gridcell"]')].map((c) => c.textContent.trim()))`);
const cols = ["status", "method", "path", "kind", "time", "size", "initiator", "conditioned"];
const asEntry = (cells) => Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
const entries = async () => (await logRows()).map(asEntry);
const text = (part) => q(`return document.querySelector('[data-part="${part}"]')?.textContent.replace(/\\s+/g, " ").trim() ?? null`);
const click = (part) => q(`const b = document.querySelector('[data-part="${part}"]'); if (!b) return false; b.click(); return true`);
const setField = (part, value, event = "change") => q(`const i = document.querySelector('[data-part="${part}"]'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); return true`);
const pick = async (part, label) => {
  await q(`document.querySelector('[data-part="${part}"] button').click()`);
  await until(() => q(`return [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent.trim() === ${JSON.stringify(label)})`), `the ${part} options open`);
  await q(`[...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === ${JSON.stringify(label)}).click()`);
};
const condition = () => text("net-condition");
const scenes = () => readFileSync(scenesFile, "utf8");
/** A request made in the frame by the test, as the app would: `{ status, ms }` or `{ error, ms }`. */
const frameFetch = (url) => inFrame(`(async () => { const t = performance.now(); try { const r = await fetch(${JSON.stringify(url)}); return { status: r.status, ms: performance.now() - t }; } catch (e) { return { error: String(e), ms: performance.now() - t }; } })()`);
/** A module import: not a request the agent sees, so only whole-frame offline (CDP) can fail it. */
let importN = 0;
const frameImport = () => inFrame(`import("/src/extra.ts?n=${++importN}").then((m) => m.extra, (e) => "failed: " + e.message)`);

try {
  await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 90000);
  await until(async () => (await q(`return !!document.querySelector("app-network-panel")`)) || (await q(`document.querySelector("#drawer-tab-http")?.click(); return false`)), "the Network panel opens", 20000);

  // --- the frame's real requests are logged ---------------------------------------------------------------------------
  await until(async () => (await entries()).some((e) => e.path === "/api/users?limit=10" && e.status === "200") && (await entries()).some((e) => e.path === "/api/status" && e.status === "200"), "the app's requests are logged", 30000);
  const users = (await entries()).find((e) => e.path === "/api/users?limit=10");
  const status = (await entries()).find((e) => e.path === "/api/status");
  check(users.method === "GET" && users.kind === "fetch" && /\d/.test(users.time) && /B$/.test(users.size), "the Http client's request is logged with method, status, time and size", JSON.stringify(users));
  check(/\/src\/net-app\.ts:\d+/.test(users.initiator), "the request names the app code that made it", users.initiator);
  check(status.kind === "xhr" && status.status === "200", "an XMLHttpRequest is logged too", JSON.stringify(status));
  check(!(await entries()).some((e) => /__gable|@vite|\/src\//.test(e.path)), "the Designer's and Vite's own requests are not listed");
  check((await text("net-summary")).startsWith("No scenario"), "without a Scenario the panel says the app talks to its real backend", await text("net-summary"));

  // --- record real responses across a reload ----------------------------------------------------------------------------
  const before = await hits();
  await click("net-record-reload");
  await until(async () => /Recording · 2 responses/.test((await text("net-record-count")) ?? ""), "the reloaded frame's first requests are recorded", 40000);
  check(((await hits())["/api/users"] ?? 0) > (before["/api/users"] ?? 0), "recording answers with the real server (it was reached again)");
  await click("net-record");
  await until(async () => (await text("net-record-count")) === "2 responses", "recording stops");
  check(true, "recording survives the frame's reload and stops on Stop");

  // --- save the recording as a Scenario ---------------------------------------------------------------------------------
  await click("net-save");
  await until(() => q(`return !!document.querySelector('[data-part="net-save-submit"]')`), "the save dialog opens");
  await until(async () => /^2 mocks/.test(await q(`return [...document.querySelectorAll(".dlg p.dim")].map((p) => p.textContent.trim()).find((t) => /mock/.test(t)) ?? ""`)), "the dialog previews the mocks");
  check((await q(`return document.querySelector('[data-part="net-save-file"]').value`)) === "/src/net-app.scenes.ts", "the dialog offers the project's scenes file");
  await setField("net-save-name", "Recorded", "input");
  await click("net-save-submit");
  await until(() => scenes().includes("Recorded: {"), "the Scenario is written", 15000);
  const written = scenes();
  check(written.includes("url: '/api/users'") || written.includes('url: "/api/users"'), "the mock matches the URL without its query", written.match(/url: .\/api\/users./)?.[0]);
  check(written.includes("Ada Lovelace") && written.includes("status: 200"), "the mock answers with the recorded status and body");
  check(written.startsWith(original.slice(0, original.indexOf("    Live:"))), "the rest of the file is untouched");
  await until(async () => /Saved Scenario "Recorded" \(2 mocks\)/.test((await text("net-saved")) ?? ""), "the panel confirms the save");

  // --- replay: the app runs on the mocks -------------------------------------------------------------------------------
  const hitsBefore = (await hits())["/api/users"];
  await click("net-use-saved");
  await until(async () => (await text("net-summary"))?.startsWith("Scenario Recorded"), "the Scenario is applied", 30000);
  await until(async () => (await frameText()).includes("Ada Lovelace"), "the app renders the recorded users", 30000);
  await until(async () => (await entries()).some((e) => e.kind === "mock" && e.path.startsWith("/api/users") && e.status === "200"), "the mock's answer is logged", 15000);
  check((await hits())["/api/users"] === hitsBefore, "under the Scenario the users come from the mock, not the server", `server hits ${hitsBefore} -> ${(await hits())["/api/users"]}`);
  await until(async () => (await q(`return document.querySelectorAll('[data-part="net-mock"]').length`)) === 2, "the Scenario's mocks are listed");
  const listedUrls = await q(`return [...document.querySelectorAll('[data-part="net-mock"]')].map((r) => r.dataset.url).sort().join(" ")`);
  check(listedUrls === "/api/status /api/users", "the panel lists the active Scenario's mocks", listedUrls);

  // --- edit and remove a mock in place ----------------------------------------------------------------------------------
  await q(`[...document.querySelectorAll('[data-part="net-mock"]')].find((r) => r.dataset.url === "/api/users").querySelector('[data-part="net-mock-edit"]').click()`);
  await until(() => q(`return !!document.querySelector('[data-part="net-edit-status"]')`), "the edit dialog opens");
  check((await q(`return document.querySelector('[data-part="net-edit-body"]').value`)).includes("Grace Hopper"), "the edit dialog shows the mock's body");
  await setField("net-edit-status", "503", "input");
  await click("net-edit-submit");
  await until(() => scenes().includes("status: 503"), "the edited status is written", 15000);
  await until(async () => (await q(`return [...document.querySelectorAll('[data-part="net-mock"]')].map((r) => r.textContent).join(" ")`)).includes("503"), "the list shows the edited mock");
  await q(`[...document.querySelectorAll('[data-part="net-mock"]')].find((r) => r.dataset.url === "/api/status").querySelector('[data-part="net-mock-remove"]').click()`);
  await until(() => !scenes().includes("/api/status"), "the removed mock is gone from the file", 15000);
  await until(async () => (await q(`return document.querySelectorAll('[data-part="net-mock"]').length`)) === 1, "the list shows one mock");
  check(true, "a mock is edited and removed in the scenes file from the panel");

  // --- MCP: the mocks as written, and undo puts the file back ---------------------------------------------------------
  const mcp = new Client({ name: "net-check", version: "1" });
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
  const listed = await call("list_mocks", { file: "src/net-app.scenes.ts" });
  const recorded = listed.body.scenes?.find((s) => s.scene === "Recorded");
  check(!listed.error && recorded?.mocks.length === 1 && recorded.mocks[0].reply.status === 503 && recorded.mocks[0].reply.body?.[0]?.name === "Ada Lovelace", "list_mocks reads the mocks as written", JSON.stringify(recorded?.mocks.map((m) => [m.method, m.url, m.reply?.status])));
  await call("set_scenario", {});
  for (let i = 0; i < 3; i++) await call("undo");
  check(scenes() === original, "undoing the remove, the edit and the save restores the scenes file byte for byte");

  // --- conditions: slow, error, offline --------------------------------------------------------------------------------
  await until(async () => (await text("net-summary"))?.startsWith("No scenario") && (await frameText()).includes("Ada Lovelace"), "back on the real backend", 30000);
  await pick("net-mode", "Slow");
  await until(async () => /^Slow/.test((await condition()) ?? ""), "the slow condition applies");
  await setField("net-delay", 1200);
  await until(async () => (await condition()) === "Slow (+1200 ms)", "the delay applies", 10000);
  const slow = await frameFetch("/api/users");
  check(slow.status === 200 && slow.ms >= 1150, "Slow holds the page's request back", `${Math.round(slow.ms)} ms`);
  await until(async () => (await entries()).some((e) => e.path === "/api/users" && /1200/.test(e.conditioned)), "the log says what the condition did");
  check(true, "the log marks the slowed request");

  await pick("net-mode", "Server error");
  await until(async () => /^Error 500/.test((await condition()) ?? ""), "the error condition applies");
  await setField("net-status", 503);
  await setField("net-match", "/api/users");
  await until(async () => (await condition()) === "Error 503 on /api/users", "status and match apply", 10000);
  const failedUsers = await frameFetch("/api/users");
  const okStatus = await frameFetch("/api/status");
  check(failedUsers.status === 503 && okStatus.status === 200, "Error answers the matching request with the status, and leaves others alone", `${failedUsers.status}, ${okStatus.status}`);

  await pick("net-mode", "Offline");
  await setField("net-match", "");
  await until(async () => (await condition()) === "Offline", "the offline condition applies", 10000);
  const offline = await frameFetch("/api/users");
  check(!!offline.error && /fetch/i.test(offline.error), "Offline fails the request like a dropped connection", offline.error);
  check((await inFrame("navigator.onLine")) === false, "navigator.onLine is false in the frame");
  check((await frameImport()) === "loaded", "request-level offline leaves the page's assets alone");

  if (noCdp) {
    check(!!(await text("net-frame-off")) && !(await q(`return !!document.querySelector('[data-part="net-frame-offline"]')`)), "without CDP, whole-frame offline is labelled unavailable and not offered");
  } else {
    await q(`document.querySelector('[data-part="net-frame-offline"] input').click()`);
    await until(async () => (await condition()) === "Offline (whole frame)", "whole-frame offline applies", 10000);
    await until(async () => /^failed/.test(await frameImport()), "the whole frame is offline over CDP", 10000);
    check(true, "whole-frame offline (CDP) fails even the page's module loads");
  }
  await pick("net-mode", "Normal");
  await until(async () => (await condition()) === "Normal", "the condition is lifted", 10000);
  await until(async () => (await frameImport()) === "loaded", "the frame is back online", 10000);
  check((await frameFetch("/api/users")).status === 200 && (await inFrame("navigator.onLine")) === true, "Normal restores the network");

  // --- MCP: conditions, recording, saving, editing ----------------------------------------------------------------------
  const set = await call("set_network_condition", { mode: "error", status: 500, match: "/api/status" });
  check(!set.error && set.body.condition.mode === "error" && set.body.condition.status === 500, "set_network_condition applies a condition", JSON.stringify(set.body.condition ?? set.body));
  check((await frameFetch("/api/status")).status === 500, "the MCP condition reaches the page");
  await until(async () => (await condition()) === "Error 500 on /api/status", "the panel shows the MCP condition");
  if (!noCdp) {
    const whole = await call("set_network_condition", { mode: "offline", wholeFrame: true });
    check(whole.body.condition?.frame === true && !whole.body.note, "set_network_condition takes the whole frame offline", JSON.stringify(whole.body));
    check(/^failed/.test(await frameImport()), "MCP whole-frame offline fails module loads");
  }
  await call("set_network_condition", { mode: "normal" });
  await until(async () => (await frameImport()) === "loaded", "MCP Normal brings the frame back", 10000);

  const net = await call("get_network", { limit: 50 });
  check(!net.error && net.body.requests.some((r) => r.url.endsWith("/api/users?limit=10") && r.status === 200 && /net-app\.ts/.test(r.initiator ?? "")) && net.body.condition.mode === "normal", "get_network lists the frame's requests and condition", `${net.body.requests?.length} requests`);
  const start = await call("record_http", { action: "start", reload: true });
  check(!start.error && start.body.recording.on, "record_http starts recording with a reload", JSON.stringify(start.body));
  await until(async () => (await call("get_recording")).body.records?.length >= 2, "the reloaded frame is recorded", 30000);
  const got = await call("get_recording");
  check(got.body.records.some((r) => r.url === "/api/users" && r.query === "?limit=10" && r.status === 200 && r.bodyChars > 0), "get_recording lists what was recorded (URL without its query)", JSON.stringify(got.body.records?.map((r) => r.url)));
  await call("record_http", { action: "stop" });
  const saved = await call("save_recording_as_scenario", { file: "src/net-app.scenes.ts", name: "From MCP", description: "Recorded over MCP" });
  check(!saved.error && saved.body.diff.includes("From MCP") && saved.body.mocks?.length === 2, "save_recording_as_scenario writes the Scenario and answers with the diff", saved.error ? saved.body : saved.body.label);
  const mocks = (await call("list_mocks", { file: "src/net-app.scenes.ts" })).body.scenes.find((s) => s.scene === "From MCP");
  check(mocks?.mocks.length === 2, "the new Scenario has a mock per request", JSON.stringify(mocks?.mocks.map((m) => m.url)));
  const users2 = mocks.mocks.find((m) => m.url === "/api/users");
  const edited = await call("edit_mock", { file: "src/net-app.scenes.ts", scene: "From MCP", index: users2.index, expectUrl: "/api/users", status: 404, delay: 300 });
  check(!edited.error && /404/.test(edited.body.diff) && /delay: 300/.test(edited.body.diff), "edit_mock rewrites the reply's status and adds a delay", edited.error ? edited.body : "");
  const stale = await call("edit_mock", { file: "src/net-app.scenes.ts", scene: "From MCP", index: users2.index, expectUrl: "/api/other", status: 200 });
  check(stale.error, "edit_mock refuses a mock that is no longer the one expected", String(stale.body).slice(0, 120));
  const removed = await call("remove_mock", { file: "src/net-app.scenes.ts", scene: "From MCP", index: users2.index });
  check(!removed.error && !scenes().includes("status: 404"), "remove_mock removes it");
  for (let i = 0; i < 3; i++) await call("undo");
  check(scenes() === original, "MCP undo restores the scenes file byte for byte");
  await mcp.close();

  if (arg("--shot")) {
    await sleep(1500);
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
  // What the panel and the frame showed when it stopped.
  console.log("panel:", await q(`return document.querySelector("app-network-panel")?.innerText.slice(0, 1500) ?? "(no panel)"`).catch(String));
  console.log("frame:", (await frameText()).slice(0, 500));
  if (process.env.CHECK_VERBOSE) {
    console.log("panel html:", await q(`return document.querySelector("app-network-panel")?.outerHTML.slice(0, 3000) ?? ""`).catch(String));
    console.log("frames:", (await browser.frames()).map((f) => f.url));
    console.log("recording:", await inFrame(`sessionStorage.getItem("__gable_designer_rec")`).catch(String));
    console.log("fetch:", await inFrame(`String(window.fetch).slice(0, 120)`).catch(String));
    console.log("scripts:", await inFrame(`[...document.scripts].map((s) => s.src || s.textContent.slice(0, 60)).join(" | ")`).catch(String));
  }
} finally {
  if (readFileSync(scenesFile, "utf8") !== original) writeFileSync(scenesFile, original);
  check(readFileSync(scenesFile, "utf8") === original, "the fixture is byte-identical at the end");
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
