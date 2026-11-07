// Driven check of the project switcher, the Preview agent install and the dev server's log and restart. Self-contained:
// it builds a fixture app outside the repository whose dependencies are not installed (local `file:` links into this
// checkout, so `npm install` works offline), starts the Designer's backend on examples/ui-gallery with its own data
// directory, starts a headless Edge, and drives the shell. It stops only the processes it started.
//
//   npm run build -w packages/designer && node packages/designer/e2e/project-check.mjs [--edge <msedge.exe>] [--shot <dir>] [--keep]
//   node packages/designer/e2e/project-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> [--shot <dir>]
//
// The second form drives a Designer window that is already running (the Tauri/WebView2 window started with GABLE_CDP_PORT)
// and starts no backend or browser. Start it on examples/ui-gallery with a fresh GABLE_DESIGNER_DATA: the check expects
// ui-gallery to be the only recent project. The window ends on ui-gallery again.
import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const repo = resolve(pkg, "../..");
const edgePath = arg("--edge", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
const shotDir = arg("--shot", null);
const keep = process.argv.includes("--keep");
const attach = process.argv.includes("--port") ? { port: Number(arg("--port")), shell: arg("--shell", "127.0.0.1:5190") } : null;
const slash = (p) => p.replaceAll("\\", "/");

let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

// --- the fixture: a Gable app whose dependencies are not installed ------------------------------------------------------
const work = mkdtempSync(join(tmpdir(), "designer-project-check-"));
const data = join(work, "data");
const fixture = join(work, "fixture-app");
const write = (file, text) => (mkdirSync(dirname(file), { recursive: true }), writeFileSync(file, text));
write(
  join(fixture, "package.json"),
  JSON.stringify(
    {
      name: "fixture-app",
      private: true,
      type: "module",
      dependencies: { "@gable/core": `file:${slash(join(repo, "packages/core"))}`, "@gable/renderer-dom": `file:${slash(join(repo, "packages/renderer-dom"))}` },
      devDependencies: { vite: `file:${slash(join(repo, "node_modules/vite"))}` },
    },
    null,
    2,
  ),
);
// The linked packages live in this checkout, outside the fixture: Vite has to be allowed to serve them. `/__crash` stops
// the dev server, the way a crash would.
write(
  join(fixture, "vite.config.js"),
  `export default {
  server: { fs: { allow: [${JSON.stringify(slash(repo))}, ${JSON.stringify(slash(fixture))}] } },
  plugins: [{ name: "crash", configureServer(server) { server.middlewares.use((req, res, next) => (req.url === "/__crash" ? (res.end("crash"), setTimeout(() => process.exit(7), 50)) : next())); } }],
};
`,
);
write(join(fixture, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n`);
write(
  join(fixture, "src/main.ts"),
  `import { bootstrap, html } from "@gable/core";
import { dom } from "@gable/renderer-dom";

class Root {
  static meta = { selector: "app-root", template: html\`<main><h1>Fixture app</h1><p class="lead">Installed from the Designer.</p></main>\` };
}
bootstrap(Root, { renderer: dom(), target: "#app" });
`,
);

// --- processes we start, and only those are stopped ---------------------------------------------------------------------
const started = [];
const startProcess = (cmd, args, options) => {
  const child = spawn(cmd, args, { windowsHide: true, ...options });
  started.push(child);
  return child;
};
const exited = (child, ms) => new Promise((ok) => (child.exitCode !== null || child.signalCode !== null ? ok(true) : (child.once("exit", () => ok(true)), setTimeout(() => ok(false), ms))));

async function cleanup() {
  for (const child of started.reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (child === backend) child.stdin.end(); // --watch-stdin: the backend closes the project's Vite and exits
    else if (child === edge) await browserClose().catch(() => undefined);
    if (await exited(child, 8000)) continue;
    // Still running: stop the tree of this process only (its own pid), never anything found by name or port.
    if (process.platform === "win32") spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    else child.kill("SIGKILL");
    await exited(child, 5000);
  }
  if (keep) return console.log(`kept ${work}`);
  // node_modules in the fixture holds links into this checkout: remove the links themselves, never what they point at.
  const unlinkLinks = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) unlinkSync(p);
      else if (st.isDirectory()) unlinkLinks(p);
    }
  };
  unlinkLinks(join(fixture, "node_modules"));
  // Edge's helper processes can hold its profile for a moment after the browser exits.
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (e) {
    console.log(`could not remove ${work}: ${e instanceof Error ? e.message : e}`);
  }
}

// --- the backend on examples/ui-gallery, then Edge ----------------------------------------------------------------------
const gallery = join(repo, "examples", "ui-gallery");
const shellPort = attach ? Number(attach.shell.split(":").pop()) : await freePort();
const cdpPort = attach ? attach.port : await freePort();
let backend = null;
let edge = null;
let backendErr = "";
let ready;
if (attach) {
  // The window's own backend: its URL is the page's, its token the one it hands the shell.
  const page = await connect(cdpPort, attach.shell);
  ready = { url: `http://${attach.shell}`, token: await page.ev("__GABLE_DESIGNER__.token") };
  page.close();
} else {
  const env = { ...process.env, GABLE_DESIGNER_DATA: data };
  backend = startProcess(process.execPath, [join(pkg, "dist/server/cli.js"), gallery, "--port", String(shellPort), "--watch-stdin"], { env, stdio: ["pipe", "pipe", "pipe"] });
  backend.stderr.on("data", (d) => (backendErr = (backendErr + d).slice(-20000)));
  ready = await new Promise((ok, fail) => {
    let out = "";
    backend.stdout.on("data", (d) => {
      out += d;
      const line = out.split("\n").find((l) => l.startsWith("GABLE_DESIGNER_READY "));
      if (line) ok(JSON.parse(line.slice("GABLE_DESIGNER_READY ".length)));
    });
    backend.once("exit", (code) => fail(new Error(`backend exited ${code}: ${backendErr}`)));
  });
  const profile = join(work, "edge-profile");
  edge = startProcess(edgePath, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1440,900", ready.url + "/"], { stdio: "ignore" });
}
let browserClose = async () => undefined;

let page;
try {
  const t0 = Date.now();
  for (;;) {
    try {
      page = await connect(cdpPort, `127.0.0.1:${shellPort}`);
      break;
    } catch (e) {
      if (Date.now() - t0 > 20000) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  browserClose = async () => {
    const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  };
  const { ev, sleep, cdp } = page;
  // `until` that survives the page reloading under it (opening a project reloads the shell).
  const until = async (fn, what, ms = 30000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      try {
        const v = await fn();
        if (v) return v;
      } catch {
        // the page is navigating
      }
      await sleep(200);
    }
    throw new Error(`timed out: ${what}`);
  };
  const text = () => ev("document.body.innerText");
  const dialogText = () => ev(`[...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText).join("\\n")`);
  const click = (selector) => ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  const clickText = (scope, label) =>
    ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(scope)})].find((b) => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); if (!el) return false; el.click(); return true; })()`);
  const shot = async (name) => {
    if (!shotDir) return;
    mkdirSync(shotDir, { recursive: true });
    const { result } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shotDir, `${name}.png`), Buffer.from(result.data, "base64"));
  };
  const projectName = () => ev(`document.querySelector("app-top-bar header button")?.textContent.trim()`);
  const connected = () => ev(`document.querySelector('[data-part="connection"]')?.textContent.trim() === "Connected"`);
  const api = async (path, body) => {
    const res = await fetch(ready.url + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${ready.token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  };

  await until(connected, "the shell connects to ui-gallery", 90000);
  check((await projectName()).startsWith("gable-ui-gallery"), "the Designer starts on the project it was given", await projectName());

  // --- Open project: recent projects and the folder lister ------------------------------------------------------------------
  await ev(`document.querySelector("app-top-bar header button").click()`);
  await until(() => ev(`document.querySelectorAll('[data-part="folders"] .mi').length > 0`), "the folder list loads");
  const recent = await ev(`[...document.querySelectorAll('[data-part="recent"] .mi')].map((b) => b.title)`);
  check(recent.length === 1 && recent[0].toLowerCase() === gallery.toLowerCase(), "the project it started on is listed as recent", recent.join(", "));
  const folders = await ev(`[...document.querySelectorAll('[data-part="folders"] .mi')].map((b) => b.innerText.replace(/\\s+/g, " ").trim())`);
  check(folders.some((f) => f.startsWith("todomvc") && f.includes("project")), "the folder lister shows the sibling folders and marks projects", folders.slice(0, 6).join(" | "));
  await ev(`document.querySelector('[aria-label="Up one folder"]').click()`);
  await until(async () => (await ev(`document.querySelector('[data-part="browse-dir"]').textContent`)).toLowerCase() === repo.toLowerCase(), "Up goes to the parent folder");
  check(true, "Up one folder lists the parent");
  // A folder that is not a project is refused with the reason, and nothing changes.
  await ev(`(() => { const i = document.querySelector('[data-part="project-path"]'); i.focus(); i.select(); })()`);
  await cdp("Input.insertText", { text: work });
  await sleep(150);
  await click('[data-part="open-project"]');
  await until(() => ev(`!!document.querySelector('[data-part="open-error"]')`), "the refusal is shown");
  check((await ev(`document.querySelector('[data-part="open-error"]').textContent`)).includes("no package.json"), "a folder without package.json is refused with the reason");
  await shot("open-project");

  // --- open the fixture: Vite and the Preview agent are missing -------------------------------------------------------------------
  await ev(`(() => { const i = document.querySelector('[data-part="project-path"]'); i.focus(); i.select(); })()`);
  await cdp("Input.insertText", { text: fixture });
  await sleep(150);
  await click('[data-part="open-project"]');
  await until(async () => (await projectName())?.startsWith("fixture-app"), "the shell reloads onto the fixture", 30000);
  check(true, "opening a project switches the Designer to it (same window, shell reloaded)");
  await until(() => ev(`!!document.querySelector('[data-part="agent-check"]')`), "the connect flow opens by itself on a first run");
  const connectText = await dialogText();
  check(connectText.includes("Preview agent not installed") && connectText.includes("Vite not found"), "the connect flow says the Preview agent and Vite are missing", connectText.split("\n").slice(0, 8).join(" | "));
  check(connectText.includes("npm install"), "it names the command it will run");
  check(await ev(`!!document.querySelector('[data-part="install"]') && !document.querySelector('[data-part="install"]').disabled`), "Install and start is offered");
  const failure = await ev(`document.querySelector('[data-part="server-failure"]')?.innerText ?? ""`);
  check(failure.includes("Could not find Vite") && failure.includes("Restart server") && failure.includes("Open log"), "the canvas shows the failure with Restart server and Open log", failure.replace(/\s+/g, " ").slice(0, 140));
  await shot("connect-missing-agent");

  // --- install and start ----------------------------------------------------------------------------------------------------------
  await click('[data-part="install"]');
  await until(() => ev(`(document.querySelector('[data-part="install-log"]')?.textContent ?? "").includes("$ npm install")`), "the install log streams into the dialog", 15000);
  check(true, "the install's output is shown while it runs");
  await until(connected, "connected after installing", 180000);
  const after = await api("/api/project");
  check(after.check.agent.found && after.check.vite.found && after.server === "running", "after the install the Preview agent and Vite are found and the dev server runs", JSON.stringify({ agent: after.check.agent.found, vite: after.check.vite.version, server: after.server }));
  check((await dialogText()).includes("Preview agent available"), "the connect dialog now shows the agent available");
  const log = await api("/api/server/log");
  check(/npm install exited with code 0/.test(log.text) && /starting the project's Vite/.test(log.text), "the log holds the install and the Vite start");
  await shot("installed-connected");
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await clickText('[role="dialog"] button', "Close");
  await sleep(300);

  // --- the dev server stops: log and a working Restart ------------------------------------------------------------------------------
  await fetch(after.previewUrl + "__crash").catch(() => undefined);
  await until(() => ev(`(document.querySelector('[data-part="server-failure"]')?.innerText ?? "").includes("The dev server stopped")`), "the failure card shows the stop", 20000);
  const card = await ev(`document.querySelector('[data-part="server-failure"]').innerText`);
  check(card.includes("exit code 7") && card.includes("exited with code 7"), "the failure card says why and shows the log's tail", card.replace(/\s+/g, " ").slice(0, 160));
  check((await ev(`document.querySelector('[data-part="connection"]').textContent.trim()`)) === "Disconnected", "the top bar says Disconnected");
  await shot("server-stopped");
  await click('[data-part="open-log"]');
  await until(() => ev(`!!document.querySelector('[data-part="server-log"]')`), "the log dialog opens");
  const full = await ev(`document.querySelector('[data-part="server-log"]').textContent`);
  check(full.includes("$ npm install") && full.includes("exited with code 7"), "Open log shows the whole log (install and Vite output)");
  await click('[data-part="restart"]');
  await until(connected, "connected after Restart server", 60000);
  check(!(await ev(`!!document.querySelector('[data-part="server-failure"]')`)), "Restart server brings the dev server and the preview back");
  const frameText = await (async () => {
    const { connectBrowser } = await import("./cdp.mjs");
    const browser = await connectBrowser(cdpPort);
    const frames = await browser.frames();
    const texts = await Promise.all(frames.map((f) => f.ev("document.body.innerText").catch(() => "")));
    browser.close?.();
    return texts.join(" ");
  })();
  check(frameText.includes("Fixture app"), "the restarted preview renders the fixture app", frameText.slice(0, 60));
  await clickText('[role="dialog"] button', "Close");
  await sleep(300);

  // --- the command palette reaches the new actions ------------------------------------------------------------------------------------
  const key = async (k, code, vk, modifiers = 0) => {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  };
  await key("k", "KeyK", 75, 2);
  await until(() => ev(`!!document.querySelector('[role="dialog"] input')`), "the palette opens");
  await sleep(150);
  await cdp("Input.insertText", { text: "Show the dev server log" });
  await sleep(250);
  await key("Enter", "Enter", 13);
  await until(() => ev(`!!document.querySelector('[data-part="server-log"]')`), "the palette opens the log");
  check(true, "the palette runs Show the dev server log");
  await clickText('[role="dialog"] button', "Close");
  await sleep(300);

  // --- back to the first project from the recent list ------------------------------------------------------------------------------
  await ev(`document.querySelector("app-top-bar header button").click()`);
  await until(() => ev(`document.querySelectorAll('[data-part="recent"] .mi').length === 2`), "both projects are recent");
  const order = await ev(`[...document.querySelectorAll('[data-part="recent"] .mi')].map((b) => b.title.toLowerCase())`);
  check(order[0] === fixture.toLowerCase() && order[1] === gallery.toLowerCase(), "recent projects are listed most recent first", order.join(" , "));
  await ev(`[...document.querySelectorAll('[data-part="recent"] .mi')][1].click()`);
  await until(async () => (await projectName())?.startsWith("gable-ui-gallery"), "the shell reloads onto ui-gallery", 30000);
  await until(connected, "connected to ui-gallery again", 90000);
  check(true, "picking a recent project opens it, starts its Vite and connects");
  await shot("back-to-gallery");
} catch (e) {
  failed++;
  console.log(`FAIL  ${e instanceof Error ? e.message : e}`);
  const body = await page?.ev("document.body.innerText").catch(() => "");
  if (body) console.log(`--- the shell showed:\n${body.slice(0, 1500)}`);
  if (backendErr) console.log(backendErr.split("\n").slice(-25).join("\n"));
} finally {
  page?.close();
  await cleanup();
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
