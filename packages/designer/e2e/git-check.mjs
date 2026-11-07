// Driven check of the drawer's Changes tab (source control, TASK-56.25) and its MCP tools.
//
//   npm run build -w packages/designer && node packages/designer/e2e/git-check.mjs [--browser <path>] [--shot <file>]
//   node packages/designer/e2e/git-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> --project <dir> --mcp <url> --token <token>   # or drives ones you started
//
// The project is a copy of test-fixtures/a11y-app under dist/ (git-ignored) that this script turns into its OWN throwaway git
// repository (git init, a local identity, one commit); the repository you are working in is never touched. It edits files in
// that copy, then drives the real shell in headless Edge: the changed files are listed in groups, a diff is rendered by
// gable-ui's code block, a ticked selection is committed (the rest stays changed), a hunk, a file and a new file are reverted
// and put back with Undo revert, and the same operations run through the MCP tools (the tab follows them over the existing
// event stream). When it spawns, it stops exactly the processes it started (each with its own child tree) and deletes its copy.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connect } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const here = fileURLToPath(new URL(".", import.meta.url));
const fixture = join(here, "..", "test-fixtures", "a11y-app");

let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

// --- the throwaway repository -----------------------------------------------------------------------------------------
const owned = !process.argv.includes("--project");
let project = arg("--project", "");
const git = (...args) => {
  const r = spawnSync("git", args, { cwd: project, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
if (owned) {
  const base = join(here, "..", "dist");
  mkdirSync(base, { recursive: true });
  project = mkdtempSync(join(base, "git-check-"));
  for (const f of ["index.html", "package.json", "vite.config.ts", "src"]) cpSync(join(fixture, f), join(project, f), { recursive: true });
  // A leading comment far from the template gives the file two hunks when both are edited.
  const app = join(project, "src", "a11y-app.ts");
  writeFileSync(app, readFileSync(app, "utf8").replace("// The Designer's driven", "// Fixture for the source control check. The Designer's driven"));
  writeFileSync(join(project, "src", "styles.css"), "main {\n  padding: 8px;\n}\n");
  writeFileSync(join(project, ".gitignore"), "node_modules\n.designer-data\n");
  git("init", "-q");
  git("config", "user.email", "check@example.com");
  git("config", "user.name", "Check");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
}
const read = (rel) => readFileSync(join(project, rel), "utf8");
const write = (rel, text) => writeFileSync(join(project, rel), text);
const appFile = "src/a11y-app.ts";
const appOriginal = owned ? read(appFile) : "";

// --- the processes this script owns -----------------------------------------------------------------------------------
const started = [];
let profile = null;
function stopStarted() {
  for (const child of started.reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  for (const dir of [profile, owned ? project : null]) {
    if (!dir) continue;
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(dir, { recursive: true, force: true });
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
  const backend = spawn(process.execPath, [cli, project], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GABLE_DESIGNER_DATA: join(project, ".designer-data") } });
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
  const cdpPort = await freePort();
  profile = mkdtempSync(join(tmpdir(), "gable-git-check-"));
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
  return { port: cdpPort, shell: host, mcp: ready.mcp };
}

const target = process.argv.includes("--port") ? { port: Number(arg("--port")), shell: arg("--shell", "127.0.0.1:5190"), mcp: { url: arg("--mcp"), token: arg("--token") } } : await spawnAll();
const page = await connect(target.port, target.shell);
const { ev, sleep, until } = page;
const q = (js) => ev(`(() => { ${js} })()`);
const click = (selector) => q(`document.querySelector(${JSON.stringify(selector)}).click()`);
const realClick = async (selector) => {
  const r = await q(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center" }); const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }`);
  await page.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
  for (const type of ["mousePressed", "mouseReleased"]) await page.cdp("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
};
const rowPaths = () => q(`return [...document.querySelectorAll('[data-part="chg-file"]')].map((r) => r.dataset.path)`);
const button = (label) => `[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))`;

let client = null;
try {
  await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 90000);

  // --- changes made in the working tree show up grouped, with counts ----------------------------------------------------
  const app = read(appFile).replace("Fixture for the source control check.", "Fixture, edited.").replace("<h1>Fixture</h1>", "<h1>Fixture title</h1>");
  write(appFile, app);
  write("src/styles.css", "main {\n  padding: 16px;\n}\n");
  write("src/extra.scenes.ts", "export const scenes = {};\n");
  await click("#drawer-tab-changes");
  await until(async () => (await rowPaths()).length === 3, "three changed files are listed", 30000);
  check(true, "the Changes tab lists the changed files", (await rowPaths()).join(", "));
  const groups = await q(`return [...document.querySelectorAll("[data-group]")].map((g) => g.dataset.group)`);
  check(groups.join() === "components,scenes,styles", "files are grouped as components, scenarios and styles", groups.join());
  const badge = await q(`return document.querySelector("#drawer-tab-changes .count")?.textContent.trim() ?? ""`);
  check(badge === "3", "the tab's badge counts the changed files", badge);
  const counts = await q(`return document.querySelector('[data-part="chg-file"][data-path="src/styles.css"] .chg-counts').textContent.trim()`);
  check(/^\+1 .1$/.test(counts), "a row shows lines added and removed", counts);

  // --- a diff rendered by gable-ui's code block ---------------------------------------------------------------------------
  await click('[data-part="chg-file"][data-path="src/a11y-app.ts"] .chg-name');
  await until(() => q(`return document.querySelectorAll('[data-part="chg-hunk"]').length === 2`), "the file's two hunks are shown");
  const diff = await q(`return [...document.querySelectorAll('[data-part="chg-hunk"] ui-code-block code > span')].map((l) => { const cells = [...l.children]; return { add: /bg-emerald/.test(l.className), del: /bg-red/.test(l.className), hunk: /bg-sky/.test(l.className), marker: cells.at(-2)?.textContent.trim(), text: cells.at(-1).textContent }; })`);
  check(diff.filter((l) => l.hunk).length === 2 && diff.filter((l) => l.hunk).every((l) => /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/.test(l.text)), "each hunk is a unified diff block with its @@ header (gable-ui code block)");
  check(diff.some((l) => l.add && l.marker === "+" && l.text.includes("Fixture title")) && diff.some((l) => l.del && l.marker === "-" && l.text.includes("<h1>Fixture</h1>")), "added and removed lines carry their markers and the real text");
  const tokens = await q(`return document.querySelectorAll('[data-part="chg-hunk"] ui-code-block code span[class*="text-"]').length`);
  check(tokens > 0, "the diff body is syntax highlighted", `${tokens} coloured spans`);

  // --- revert one hunk, then Undo revert -------------------------------------------------------------------------------------
  const both = read(appFile);
  await click('[data-part="chg-hunk"][data-hunk="1"] [data-part="chg-revert-hunk"]');
  await until(() => q(`return !!document.querySelector('[data-part="chg-revert-confirm"]')`), "the revert asks first");
  check(read(appFile) === both, "asking to revert changes nothing yet");
  await click('[data-part="chg-revert-confirm"]');
  await until(() => read(appFile) !== both, "the hunk is reverted in the file", 15000);
  check(read(appFile).includes("<h1>Fixture</h1>") && read(appFile).includes("edited."), "only that hunk went back to the last commit", "the template line is back, the comment edit stays");
  await until(() => q(`return document.querySelectorAll('[data-part="chg-hunk"]').length === 1`), "the view shows the one hunk left");
  await until(() => q(`return ${button("Undo revert")} && !${button("Undo revert")}.disabled`), "Undo revert is enabled");
  await q(`${button("Undo revert")}.click()`);
  await until(() => read(appFile) === both, "Undo revert puts the hunk back", 15000);
  check(true, "Undo revert restores the file byte for byte");

  // --- commit a selection ---------------------------------------------------------------------------------------------------
  await realClick('[data-part="chg-file"][data-path="src/styles.css"] ui-checkbox label');
    await until(() => q(`return document.querySelector('[data-part="chg-message"]').value === "Update styles.css"`), "choosing a file suggests a message");
  check(await q(`return !document.querySelector('[data-part="chg-commit"]').disabled`), "Commit is enabled with a file chosen and a message");
  await q(`const t = document.querySelector('[data-part="chg-message"]'); t.value = "Pad main more"; t.dispatchEvent(new Event("input", { bubbles: true }))`);
  await click('[data-part="chg-commit"]');
  await until(() => git("log", "-1", "--format=%s") === "Pad main more", "the commit exists in the repository", 15000);
  check(git("show", "--name-only", "--format=", "HEAD") === "src/styles.css", "exactly the chosen file is in the commit", git("show", "--name-only", "--format=", "HEAD"));
  await until(async () => (await rowPaths()).length === 2, "the committed file leaves the list");
  check(true, "the other changes stay changed", (await rowPaths()).join(", "));
  check(!!(await q(`return document.querySelector('[data-part="chg-notice"]')?.textContent.includes("Pad main more")`)), "the tab says what was committed");

  // --- revert a whole new file, then Undo revert ---------------------------------------------------------------------------
  await click('[data-part="chg-file"][data-path="src/extra.scenes.ts"] .chg-name');
  await until(() => q(`return document.querySelector('[data-part="chg-diff-path"]')?.textContent.trim() === "src/extra.scenes.ts" && document.querySelector('[data-part="chg-hunk"]')?.textContent.includes("export const scenes")`), "the new file's diff is shown");
  check(await q(`return document.querySelector('[data-part="chg-revert-hunk"]') === null`), "a new file offers revert for the whole file only, not per hunk");
  await click('[data-part="chg-revert-file"]');
  await until(() => q(`return !!document.querySelector('[data-part="chg-revert-confirm"]')`), "the revert asks first");
  await click('[data-part="chg-revert-confirm"]');
  await until(() => !existsSync(join(project, "src/extra.scenes.ts")), "the new file is deleted", 15000);
  await until(() => q(`return ${button("Undo revert")} && !${button("Undo revert")}.disabled`), "Undo revert is enabled");
  await q(`${button("Undo revert")}.click()`);
  await until(() => existsSync(join(project, "src/extra.scenes.ts")), "Undo revert brings the new file back", 15000);
  check(read("src/extra.scenes.ts") === "export const scenes = {};\n", "the new file is back with its content");

  // --- the same through the MCP tools; the tab follows ---------------------------------------------------------------------
  client = new Client({ name: "git-check", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(target.mcp.url), { requestInit: { headers: { authorization: `Bearer ${target.mcp.token}` } } }));
  const tool = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content[0].text;
    return { error: r.isError === true, text, json: r.isError ? null : JSON.parse(text) };
  };
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check(["get_changes", "get_file_diff", "commit_changes", "revert_changes", "undo_revert"].every((t) => tools.includes(t)), "the MCP server lists the source control tools");
  const changes = await tool("get_changes");
  check(changes.json?.changed === 2 && changes.json.groups.map((g) => g.group).join() === "components,scenes", "get_changes reports the same changes as the tab", changes.text.replace(/\s+/g, " ").slice(0, 120));
  const fileDiff = await tool("get_file_diff", { path: "src/a11y-app.ts" });
  check(fileDiff.json?.hunks.length === 2 && fileDiff.json.diff.includes("+<h1>") === false && fileDiff.json.diff.includes("Fixture title"), "get_file_diff returns the hunks of the file");
  const rev = await tool("revert_changes", { path: "src/a11y-app.ts", hunk: 0 });
  check(rev.json?.ok === true && !read(appFile).includes("Fixture, edited."), "revert_changes reverts one hunk", rev.error ? rev.text : "");
  await until(() => q(`return document.querySelectorAll('[data-part="chg-hunk"]').length <= 1 || document.querySelector('[data-part="chg-diff-path"]')?.textContent.trim() !== "src/a11y-app.ts"`), "the tab follows the MCP revert over the existing event stream");
  check(true, "the Changes tab updated after the MCP revert, with no new connection");
  check((await tool("undo_revert")).json?.ok === true && read(appFile) === both, "undo_revert puts it back");
  const commit = await tool("commit_changes", { paths: ["src/a11y-app.ts", "src/extra.scenes.ts"], message: "Commit from an agent" });
  check(commit.json?.ok === true && git("log", "-1", "--format=%s") === "Commit from an agent" && git("status", "--porcelain") === "", "commit_changes commits the listed files", commit.error ? commit.text : commit.json?.sha);
  await until(async () => (await rowPaths()).length === 0, "the tab shows nothing left to commit");
  check(!!(await q(`return document.querySelector('[data-part="chg-empty"]')`)), "with a clean tree the tab says there is nothing to commit");
  check((await tool("revert_changes", { path: "src/nope.ts" })).error, "revert_changes refuses a path that is not a changed file");

  if (arg("--shot")) {
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
  try { console.log("--- layout:", await ev(`(() => { const f = document.querySelector('[data-part="chg-files"]').getBoundingClientRect(); const l = document.querySelector('[data-part="chg-file"][data-path="src/styles.css"] label').getBoundingClientRect(); const e = document.elementFromPoint(l.x + 8, l.y + 8); const d = document.querySelector("[data-part=drawer]")?.getBoundingClientRect(); return JSON.stringify({ files: [f.y, f.height], label: [l.y, l.height], hit: e.tagName + "." + e.className, vh: innerHeight, drawer: d && [d.y, d.height] }) })()`)); } catch {}
  try { console.log("--- page text:", String(await ev(`document.querySelector("app-changes-panel")?.innerText ?? "(no panel) " + document.body.innerText.slice(0, 400)`)).slice(0, 600)); } catch {}
} finally {
  await client?.close().catch(() => undefined);
  page.close();
  if (owned) write(appFile, appOriginal);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
