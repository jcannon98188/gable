// Driven check of the drawer's Performance tab (TASK-56.16): the Preview agent's metrics are listed with ratings, the LCP
// and layout-shift elements select their element, Re-run reloads the frame and measures the fresh load, CPU throttling goes
// through CDP and really slows the frame, a hot update measures again, and MCP get_performance returns the same report.
//
//   npm run build -w packages/designer && node packages/designer/e2e/perf-check.mjs [--browser <path>] [--shot <file>]
//   node packages/designer/e2e/perf-check.mjs --no-cdp     # a backend without CDP: throttling is labelled unavailable
//
// It runs against test-fixtures/perf-app (slow on purpose) and edits its src/perf-app.ts once for the hot update, putting
// it back byte for byte (and failing if it could not). It starts the backend with --cdp-port and a headless Edge on that
// port, and stops exactly the processes it started (each by its PID, with its own child tree), nothing else.
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
const project = join(here, "..", "test-fixtures", "perf-app");
const sourceFile = join(project, "src", "perf-app.ts");
const original = readFileSync(sourceFile, "utf8");
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
  profile = mkdtempSync(join(tmpdir(), "gable-perf-check-"));
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
const metric = (id) => q(`const r = document.querySelector('[data-part="perf-metric"][data-metric="${id}"]'); return r && { rating: r.dataset.rating, value: r.querySelector('[data-part="perf-value"]').textContent.trim(), text: r.textContent.replace(/\\s+/g, " ").trim(), element: r.querySelector('[data-part="perf-element"]')?.textContent.trim() ?? null }`);
const fact = (part, key) => q(`const g = document.querySelector('[data-part="${part}"]'); const row = g && [...g.querySelectorAll(".perf-kv")].find((r) => r.children[0].textContent.trim() === ${JSON.stringify(key)}); return row ? row.children[1].textContent.trim() : null`);
const detail = () => q(`return document.querySelector(".perf-detail")?.textContent.trim() ?? ""`);
const measuredAt = async () => Number(/measured ([\d.]+) (ms|s)/.exec(await detail())?.slice(1).reduce((v, u) => (u === "s" ? v * 1000 : v)) ?? NaN);
/** A fixed amount of work in the preview frame, timed there (to see CPU throttling). */
const frameWork = async () => {
  const frames = await browser.frames();
  const frame = frames.find((f) => !f.url.includes("about:")) ?? frames[0];
  return frame.ev(`(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 2e7; i++) x = (x + i * 7) % 1000003; return performance.now() - t + (x < 0 ? 1 : 0); })()`);
};

try {
  await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 90000);

  // --- the metrics are listed with ratings ----------------------------------------------------------------------------
  // The drawer may still be settling right after connect: click the tab until it is open on Performance.
  await until(async () => (await q(`return !!document.querySelector("app-performance-tab")`)) || (await q(`document.querySelector("#drawer-tab-perf")?.click(); return false`)), "the Performance tab opens", 20000);
  await until(() => q(`return !!document.querySelector('[data-part="perf-metric"][data-metric="lcp"]')`), "the tab shows a report", 60000);
  const ids = await q(`return [...document.querySelectorAll('[data-part="perf-metric"]')].map((r) => r.dataset.metric)`);
  check(["ttfb", "fcp", "lcp", "cls", "inp", "tbt", "dom"].every((id) => ids.includes(id)), "every metric has a row", ids.join(", "));
  const fcp = await metric("fcp");
  check(fcp.rating === "good" && /\d/.test(fcp.value), "FCP is measured and rated", `${fcp.value} ${fcp.rating}`);
  const lcp = await metric("lcp");
  check(lcp.rating !== "none" && lcp.element === "<p> in PerfApp", "LCP is measured and links to the paragraph and its component", `${lcp.value} ${lcp.rating}, ${lcp.element}`);
  const cls = await metric("cls");
  check(Number(cls.value) > 0.1 && cls.rating === "needs-improvement", "the late banner's layout shift is in CLS, rated needs work", `${cls.value} ${cls.rating}`);
  const tbt = await metric("tbt");
  check(/ms|s$/.test(tbt.value) && parseFloat(tbt.value) >= 50, "the busy loop's long task blocks (TBT)", `${tbt.value} ${tbt.rating}`);
  const inp = await metric("inp");
  check(inp.value === "—" && inp.rating === "none" && inp.text.includes("No interaction yet"), "INP without an interaction says so instead of a number", inp.text);
  const dom = await metric("dom");
  check(/^\d+ elements$/.test(dom.value) && dom.rating === "good", "DOM size is counted", dom.value);
  check((await fact("perf-navigation", "Type")) === "navigate", "navigation timing is of the first load");
  const longest = await fact("perf-long-tasks", "Longest");
  check(!!longest && parseFloat(longest) >= 150, "the long task is listed", longest);
  check(/\d/.test((await fact("perf-resources", "Count")) ?? ""), "requests are summarised", await fact("perf-resources", "Count"));
  check((await fact("perf-gable", "Signal flushes")) !== null, "Gable's own numbers come from the devtools hook", `flushes ${await fact("perf-gable", "Signal flushes")}, first tree ${await fact("perf-gable", "First component tree")}`);
  check(!!(await q(`return document.querySelector('[data-part="perf-dev-note"]')?.textContent.includes("dev server")`)), "the report says it is a dev server's numbers");
  const device = await q(`return document.querySelector('[data-part="perf-device"]').textContent`);
  check(/^\S.* \d+ × \d+ @\d/.test(device) && device.includes(noCdp ? "throttling: unavailable" : "throttling: none"), "the frame size and throttling are shown", device);
  const status = await q(`return document.querySelector('[data-part="perf-status"]').textContent.trim()`);
  const badge = await q(`return document.querySelector("#drawer-tab-perf .count")?.textContent.trim() ?? "0"`);
  const rated = await q(`return [...document.querySelectorAll('[data-part="perf-metric"]')].filter((r) => r.dataset.rating === "poor" || r.dataset.rating === "needs-improvement").length`);
  check(Number(badge) === rated && rated >= 1 && /need/.test(status), "the tab's badge counts the metrics that are not good", `badge ${badge}, ${status}`);

  // --- element links select their element -----------------------------------------------------------------------------
  await q(`document.querySelector('[data-part="perf-element"][data-for="lcp"]').click()`);
  await until(() => q(`return document.querySelector('[data-part="perf-element"][data-for="lcp"]')?.getAttribute("aria-current") === "true"`), "the LCP element is selected");
  check(true, "the LCP link selects the paragraph on the canvas (the agent reported the pick back)");
  const shifts = await q(`return [...document.querySelectorAll('[data-part="perf-shift-element"]')].map((b) => b.textContent.trim())`);
  check(shifts.length > 0, "layout shifts list their source elements", shifts.join(", "));
  const other = await q(`const b = [...document.querySelectorAll('[data-part="perf-shift-element"]')].find((b) => !b.disabled && b.getAttribute("aria-current") !== "true"); if (!b) return null; b.click(); return b.textContent.trim()`);
  if (other) {
    await until(() => q(`return [...document.querySelectorAll('[data-part="perf-shift-element"]')].some((b) => b.textContent.trim() === ${JSON.stringify(other)} && b.getAttribute("aria-current") === "true")`), "the shift source is selected");
    check(true, "a layout shift's source link selects that element", other);
  }

  // --- Re-run reloads the frame and measures the fresh load -------------------------------------------------------------
  const before = await measuredAt();
  await q(`document.querySelector('[data-part="perf-rerun"]').click()`);
  await until(() => q(`return document.querySelector('[data-part="perf-rerun"]').textContent.trim() !== "Re-run"`), "Re-run starts", 5000);
  await until(async () => (await fact("perf-navigation", "Type")) === "reload" && (await detail()).startsWith("After Re-run"), "the fresh load is measured", 60000);
  check(true, "Re-run reloads the frame (navigation type reload) and reports after it");
  await until(() => q(`return document.querySelector('[data-part="perf-rerun"]').textContent.trim() === "Re-run"`), "Re-run is ready again");
  const lcp2 = await metric("lcp");
  check(lcp2.element === "<p> in PerfApp", "after the reload, LCP links to the paragraph again", lcp2.element);
  check(Number.isFinite(before), "each report says when it was measured", `${before} ms after navigation start`);

  // --- CPU throttling over CDP ------------------------------------------------------------------------------------------
  if (noCdp) {
    check(!!(await q(`return !!document.querySelector('[data-part="perf-throttle-off"]') && !document.querySelector('[data-part="perf-cpu"]')`)), "without CDP, throttling is labelled unavailable and not offered");
    const env = await q(`return document.querySelector('[data-part="perf-device"]').textContent`);
    check(env.includes("throttling: unavailable here"), "the frame line says why there is no throttling", env);
  } else {
    check(!(await q(`return !!document.querySelector('[data-part="perf-throttle-off"]')`)), "with CDP, the throttling controls are offered");
    const plain = await frameWork();
    await q(`document.querySelector('[data-part="perf-cpu"] button').click()`);
    await until(() => q(`return [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent.trim() === "4× slower")`), "the CPU options open");
    await q(`[...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "4× slower").click()`);
    await until(() => q(`return document.querySelector('[data-part="perf-device"]').textContent.endsWith("throttling: CPU 4×")`), "the frame is throttled", 10000);
    const slow = await frameWork();
    check(slow > plain * 2, "CPU 4× really slows the frame's main thread", `${plain.toFixed(0)} ms -> ${slow.toFixed(0)} ms for the same work`);
    await q(`document.querySelector('[data-part="perf-cpu"] button').click()`);
    await until(() => q(`return [...document.querySelectorAll('[role="option"]')].some((o) => o.textContent.trim() === "No throttling")`), "the CPU options open again");
    await q(`[...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "No throttling").click()`);
    await until(() => q(`return document.querySelector('[data-part="perf-device"]').textContent.endsWith("throttling: none")`), "throttling is off again", 10000);
    const back = await frameWork();
    check(back < slow / 2, "No throttling restores the frame's speed", `${back.toFixed(0)} ms`);
  }

  // --- MCP get_performance returns the same report ----------------------------------------------------------------------
  const mcp = new Client({ name: "perf-check", version: "1" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(target.ready.mcp.url), { requestInit: { headers: { authorization: `Bearer ${target.ready.mcp.token}` } } }));
  const res = await mcp.callTool({ name: "get_performance", arguments: {} });
  const got = JSON.parse(res.content[0].text);
  const shown = await q(`return [...document.querySelectorAll('[data-part="perf-metric"]')].map((r) => r.dataset.metric + ":" + r.dataset.rating)`);
  const fromMcp = got.report?.metrics.map((m) => `${m.id}:${m.rating ?? "none"}`) ?? [];
  check(!res.isError && got.report && got.after === "MCP", "get_performance measures the selected frame", got.error ?? got.after);
  check(got.report?.metrics.find((m) => m.id === "lcp")?.element?.node?.component === "PerfApp" && got.note.includes("dev server"), "the MCP report names the LCP element's component and the dev-server caveat");
  await until(() => q(`return document.querySelector(".perf-detail")?.textContent.startsWith("After MCP")`), "the tab shows the MCP measurement", 5000);
  const shownAfter = await q(`return [...document.querySelectorAll('[data-part="perf-metric"]')].map((r) => r.dataset.metric + ":" + r.dataset.rating)`);
  check(JSON.stringify(shownAfter) === JSON.stringify(fromMcp), "the tab and get_performance show the same ratings", fromMcp.join(" "));
  void shown;
  const reloaded = JSON.parse((await mcp.callTool({ name: "get_performance", arguments: { reload: true } })).content[0].text);
  check(reloaded.report?.navigation?.type === "reload" && reloaded.after === "Re-run", "get_performance with reload measures a fresh load", `${reloaded.after}, ${reloaded.report?.navigation?.type}`);
  await mcp.close();

  // --- a hot update measures again --------------------------------------------------------------------------------------
  await until(() => q(`return document.querySelector('[data-part="perf-rerun"]').textContent.trim() === "Re-run"`), "idle before the edit");
  const at0 = await measuredAt();
  writeFileSync(sourceFile, original.replace("<h1 class=\"title\">Performance fixture</h1>", "<h1 class=\"title\">Performance fixture (edited)</h1>"));
  await until(async () => (await detail()).startsWith("After hot update") && (await measuredAt()) > at0, "the tab measures after the hot update", 30000);
  check(true, "a hot update measures again");
  const hot = await fact("perf-gable", "Last hot update");
  check(!!hot && /next frame \d/.test(hot), "the hot update's time to the next frame is shown", hot);
  writeFileSync(sourceFile, original);
  await until(async () => (await detail()).startsWith("After hot update") && (await measuredAt()) > at0, "settled after restoring", 30000);

  if (arg("--shot")) {
    await sleep(1500);
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
} finally {
  if (readFileSync(sourceFile, "utf8") !== original) writeFileSync(sourceFile, original);
  check(readFileSync(sourceFile, "utf8") === original, "the fixture is byte-identical at the end");
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
