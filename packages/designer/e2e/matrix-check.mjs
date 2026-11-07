// Driven check of the drawer's Matrix tab (TASK-56.22): every Scenario is rendered at several widths in a headless browser,
// baselines are saved, and a CSS change shows as a "changed" cell (pixels, with the red diff) while an invisible markup change
// shows as a "markup" cell (the rendered-markup diff in the ui code-block). The MCP matrix tools do the same.
//
//   npm run build -w packages/designer && node packages/designer/e2e/matrix-check.mjs [--browser <path>] [--shot <file>]
//
// It runs against test-fixtures/matrix-app. It edits that fixture's pricing-card.css and pricing-card.ts and restores both
// (and checks it did). It starts the backend and a headless Edge on a fresh profile, and stops exactly the processes it
// started (each by its PID, with its own child tree). Baselines go to the Designer's data directory, not the project.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connect } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const here = fileURLToPath(new URL(".", import.meta.url));
const project = join(here, "..", "test-fixtures", "matrix-app");
const noCdp = process.argv.includes("--no-cdp");

/** Every file of the fixture's src, to show the check wrote none. */
const srcFiles = () => {
  const dir = join(project, "src");
  return Object.fromEntries(readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
};
const srcBefore = JSON.stringify(srcFiles());

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
  profile = mkdtempSync(join(tmpdir(), "gable-matrix-check-"));
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
const { ev, sleep, until } = page;
const q = (js) => ev(`(() => { ${js} })()`);
const text = (part) => q(`return document.querySelector('[data-part="${part}"]')?.textContent.replace(/\\s+/g, " ").trim() ?? null`);
const has = (part) => q(`return !!document.querySelector('[data-part="${part}"]')`);
const click = (part) => q(`const b = document.querySelector('[data-part="${part}"]'); if (!b) return false; b.click(); return true`);
const setField = (part, value) => q(`const i = document.querySelector('[data-part="${part}"]'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event("input", { bubbles: true })); return true`);
const cells = () => q(`return [...document.querySelectorAll('[data-part="mx-cell"]')].map((c) => ({ status: c.dataset.status, width: Number(c.dataset.width), row: c.closest('[data-part="mx-row"]')?.dataset.scene }))`);
const statuses = async () => (await cells()).map((c) => `${c.row}@${c.width}:${c.status}`).join(" ");
const tab = (value) => q(`document.querySelector("#drawer-tab-${value}").click(); return true`);
const enabled = (part) => q(`const b = document.querySelector('[data-part="${part}"]'); return !!b && !b.disabled`);

const cssFile = join(project, "src", "pricing-card.css");
const tsFile = join(project, "src", "pricing-card.ts");
const cssOrig = readFileSync(cssFile, "utf8");
const tsOrig = readFileSync(tsFile, "utf8");
const ALL = (s) => `Starter@375:${s} Starter@1024:${s} Pro@375:${s} Pro@1024:${s}`;

try {
  await until(() => ev(`!!document.body?.innerText.includes("Connected")`), "the shell is connected", 90000);
  const mcp = new Client({ name: "matrix-check", version: "1" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(target.ready.mcp.url), { requestInit: { headers: { authorization: `Bearer ${target.ready.mcp.token}` } } }));
  const callRaw = (name, args = {}) => mcp.callTool({ name, arguments: args });
  const call = async (name, args = {}) => {
    const r = await callRaw(name, args);
    const t = r.content[0]?.text ?? "";
    let body;
    try {
      body = JSON.parse(t);
    } catch {
      body = t;
    }
    return { error: !!r.isError, body };
  };
  const rerun = async (want) => {
    await click("mx-run");
    await sleep(600);
    await until(async () => (await enabled("mx-run")) && (await statuses()).includes(want), `the rerun shows ${want}`, 180000);
  };

  await until(() => q(`return !!document.querySelector("#drawer-tab-matrix")`), "the drawer has a Matrix tab", 20000);
  await until(async () => (await tab("matrix"), await has("mx-run")), "the Matrix panel opens", 30000);
  check((await text("mx-empty")) !== null, "the panel starts empty and says so", await text("mx-empty"));

  // --- run: every Scenario at every width -------------------------------------------------------------------------------
  await setField("mx-widths", "375, 1024");
  await click("mx-run");
  await until(async () => (await cells()).length === 4, "four cells render (2 scenes x 2 widths)", 180000);
  check((await statuses()) === ALL("new"), "the first run has no baselines: every cell is new", await statuses());
  check((await text("mx-count-new"))?.startsWith("4"), "the chips count the new cells", await text("mx-count-new"));
  const pics = await q(`return [...document.querySelectorAll('[data-part="mx-cell"] img')].map((i) => i.naturalWidth > 0)`);
  check(pics.length === 4 && pics.every(Boolean), "each cell shows a rendered picture", JSON.stringify(pics));

  // --- baselines --------------------------------------------------------------------------------------------------------
  await click("mx-save-all");
  await until(async () => (await statuses()) === ALL("same"), "saving baselines makes every cell same", 30000);
  check(true, "Save all as baselines makes every cell match");
  await rerun("same");
  check((await statuses()) === ALL("same"), "an unchanged project matches its baselines on a rerun (the render is stable)", await statuses());

  // --- a CSS change: pixels differ ---------------------------------------------------------------------------------------
  writeFileSync(cssFile, cssOrig.replace("background: #1d4ed8", "background: #dc2626"));
  await sleep(800);
  await rerun("changed");
  check((await statuses()) === ALL("changed"), "a CSS colour change marks every cell changed", await statuses());
  check((await text("mx-count-changed"))?.startsWith("4"), "the changed chip counts them", await text("mx-count-changed"));
  await q(`document.querySelector('[data-part="mx-cell"]').click(); return true`);
  await until(() => has("mx-detail"), "the cell opens");
  await until(() => q(`const i = document.querySelector('[data-part="mx-shot"]'); return !!i && i.naturalWidth > 0`), "the diff picture shows", 15000);
  check(/changed/.test(await text("mx-detail-status")), "the opened cell says Changed", await text("mx-detail-status"));
  check(await q(`return document.querySelector('[data-part="mx-shot"]').src.startsWith("data:image/png")`), "the detail shows the diff image");
  const red = await q(`const i = document.querySelector('[data-part="mx-shot"]'); const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext("2d"); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 200 && d[k + 1] < 80 && d[k + 2] < 80) n++; return n`);
  check(red > 100, "the diff picture marks the changed pixels in red", String(red));
  const got = await call("get_matrix");
  check(!got.error && got.body.counts.changed === 4, "get_matrix reports the same four changed cells", JSON.stringify(got.body.counts));
  const cell = await callRaw("get_matrix_cell", { cell: { file: "/src/pricing-card.scenes.ts", scene: "Starter", width: 375 } });
  check(cell.content.filter((c) => c.type === "image").length === 3, "get_matrix_cell returns the current, baseline and diff images");

  // --- restore the CSS, change the markup only -------------------------------------------------------------------------
  writeFileSync(cssFile, cssOrig);
  writeFileSync(tsFile, tsOrig.replace('<section class="card">', '<section class="card" data-plan="x">'));
  await sleep(800);
  const run = await call("run_matrix", { breakpoints: [{ width: 375 }, { width: 1024 }] });
  check(!run.error && run.body.counts.markup === 4 && run.body.counts.changed === 0, "run_matrix: an invisible attribute is a markup change, not a pixel change", JSON.stringify(run.body.counts ?? run.body));
  await until(async () => (await statuses()).includes("markup"), "the panel shows the run MCP made", 15000);
  check((await statuses()) === ALL("markup"), "the panel shows the markup cells", await statuses());
  const mk = await callRaw("get_matrix_cell", { cell: { file: "/src/pricing-card.scenes.ts", scene: "Starter", width: 375 }, images: "diff" });
  check(/^[+] *<section class="card" data-plan="x">/m.test(JSON.parse(mk.content[0].text).markupDiff ?? ""), "the markup diff names the added attribute");
  await until(() => has("mx-markup-diff"), "the opened cell shows the markup diff", 15000);
  const diffText = await q(`return document.querySelector('[data-part="mx-markup-diff"]').innerText`);
  check(diffText.includes("data-plan"), "the code-block renders the markup diff", diffText.slice(0, 120));

  // --- save what changed, forget ----------------------------------------------------------------------------------------
  const saved = await call("save_matrix_baselines", { cells: "changed" });
  check(saved.body.saved === 4 && saved.body.counts.same === 4, "save_matrix_baselines saves the changed cells", JSON.stringify(saved.body.counts));
  const gone = await call("forget_matrix_baselines", { cells: "all" });
  check(gone.body.counts.new === 4, "forget_matrix_baselines makes every cell new again", JSON.stringify(gone.body.counts));
  const bad = await call("run_matrix", { scenes: ["Missing"] });
  check(bad.error, "a run that matches no scene is refused", String(bad.body).slice(0, 80));
  await mcp.close();

  if (arg("--shot")) {
    await tab("matrix");
    await sleep(1500);
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
  console.log("panel:", await q(`return document.querySelector("app-matrix-panel")?.innerText.slice(0, 1500) ?? "(no panel)"`).catch(String));
} finally {
  writeFileSync(cssFile, cssOrig);
  writeFileSync(tsFile, tsOrig);
  check(JSON.stringify(srcFiles()) === srcBefore, "the fixture's files are restored");
  page.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
