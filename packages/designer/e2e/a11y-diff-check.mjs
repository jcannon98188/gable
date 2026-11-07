// Driven check of the drawer's Accessibility and Code tabs: the Preview agent's checks are listed with element links, a row
// selects its element, a Designer edit shows its real unified diff, the checks follow the edit, and Undo restores the file.
//
//   node packages/designer/e2e/a11y-diff-check.mjs                     # spawns the backend and a headless Edge itself
//   node packages/designer/e2e/a11y-diff-check.mjs --port 9444 --shell 127.0.0.1:5190   # or drives ones you started
//
// It runs against test-fixtures/a11y-app (inaccessible on purpose) and edits its src/a11y-app.ts through the Designer; Undo
// puts the file back, and the script checks that it is byte-identical afterwards (restoring it, and failing, if not). When it
// spawns, it stops exactly the processes it started (each with its own child tree), nothing else. Build the Designer first.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const here = fileURLToPath(new URL(".", import.meta.url));
const project = join(here, "..", "test-fixtures", "a11y-app");
const sourceFile = join(project, "src", "a11y-app.ts");
const original = readFileSync(sourceFile, "utf8");

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
  const backend = spawn(process.execPath, [cli, project], { stdio: ["ignore", "pipe", "pipe"] });
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
  profile = mkdtempSync(join(tmpdir(), "gable-a11y-check-"));
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
  return { port: cdpPort, shell: host };
}

const target = process.argv.includes("--port") ? { port: Number(arg("--port")), shell: arg("--shell", "127.0.0.1:5190") } : await spawnAll();
const page = await connect(target.port, target.shell);
const { ev, sleep, until } = page;
const q = (js) => ev(`(() => { ${js} })()`);

try {
  await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 90000);

  // --- the checks run in the preview and are listed -----------------------------------------------------------------
  await q(`document.querySelector("#drawer-tab-a11y").click()`);
  await until(() => q(`return /violation/.test(document.querySelector('[data-part="a11y-status"]')?.textContent ?? "")`), "the checks report", 60000);
  const rules = await q(`return [...document.querySelectorAll('[data-part="a11y-row"]')].map((r) => r.dataset.rule)`);
  check(["image-alt", "label", "color-contrast"].every((r) => rules.includes(r)), "the agent's checks find the fixture's problems", rules.join(", "));
  const status = await q(`return document.querySelector('[data-part="a11y-status"]').textContent.trim()`);
  const badge = await q(`return document.querySelector("#drawer-tab-a11y .count")?.textContent.trim() ?? ""`);
  check(status === `${badge} violation${badge === "1" ? "" : "s"}`, "the tab's badge counts the violations", `badge ${badge}, ${status}`);
  check((await ev(`document.body.innerText`)).includes("axe-core"), "the report names the checker that ran");
  const link = await q(`return document.querySelector('[data-part="a11y-row"][data-rule="image-alt"] [data-part="a11y-element"]').textContent.trim()`);
  check(link === "<img> in A11yApp", "a row links to its element and the component that renders it", link);

  // --- a row selects its element --------------------------------------------------------------------------------------
  await q(`document.querySelector('[data-part="a11y-row"][data-rule="image-alt"]').click()`);
  await until(() => q(`return document.querySelector('[data-part="a11y-row"][data-rule="image-alt"]')?.getAttribute("aria-current") === "true"`), "the row's element is selected");
  check(true, "selecting a row selects its element on the canvas (the agent reported the pick back)");
  await until(() => ev(`[...document.querySelectorAll('[role="tab"], [data-part="trigger"]')].some((t) => t.textContent.trim() === "Content")`), "the Content tab exists");
  await q(`[...document.querySelectorAll('[role="tab"], [data-part="trigger"]')].find((t) => t.textContent.trim() === "Content").click()`);
  await until(() => q(`return !!document.querySelector('input[aria-label="name"]')`), "the Content tab shows the attribute editor");

  // --- an edit through the Designer: add the missing alt ----------------------------------------------------------------
  const before = readFileSync(sourceFile, "utf8");
  await q(`
    const set = (label, v) => { const i = document.querySelector('input[aria-label="' + label + '"]'); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
    set("name", "alt"); set("value", "Fixture logo");`);
  await sleep(100);
  await q(`[...document.querySelector('input[aria-label="name"]').closest(".prop").querySelectorAll("button")].find((b) => b.textContent.trim() === "Add").click()`);
  await until(() => readFileSync(sourceFile, "utf8") !== before, "the edit reaches the file");
  check(readFileSync(sourceFile, "utf8").includes('alt="Fixture logo"'), "the edit wrote the attribute to the source");

  await q(`document.querySelector("#drawer-tab-code").click()`);
  await until(() => q(`return !!document.querySelector('[data-part="patch-diff"]')`), "the Code tab shows the diff");
  const diff = await q(`return [...document.querySelectorAll('[data-part="patch-diff"] .ln')].map((l) => ({ cls: l.className, text: [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("") }))`);
  const added = diff.filter((l) => /\badd\b/.test(l.cls)).map((l) => l.text);
  const removed = diff.filter((l) => /\bdel\b/.test(l.cls)).map((l) => l.text);
  check(diff.some((l) => /\bhunk\b/.test(l.cls) && /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@$/.test(l.text)), "the diff has unified hunk headers", diff.find((l) => /\bhunk\b/.test(l.cls))?.text);
  check(added.some((t) => t.includes('alt="Fixture logo"')) && removed.some((t) => t.includes("<img") && !t.includes("alt=")), "the diff shows the real change: the img line removed and added with alt", `${removed.length} removed, ${added.length} added`);
  // The diff is what reached the disk: removed lines are in the old text, added lines in the new one.
  const now = readFileSync(sourceFile, "utf8");
  check(
    removed.length > 0 && removed.every((t) => before.includes(t.slice(1))) && added.every((t) => now.includes(t.slice(1))),
    "every removed line was in the file before and every added line is in it now",
  );

  // --- the checks follow the edit -------------------------------------------------------------------------------------
  await q(`document.querySelector("#drawer-tab-a11y").click()`);
  await until(() => q(`return !document.querySelector('[data-part="a11y-row"][data-rule="image-alt"]') && /violation/.test(document.querySelector('[data-part="a11y-status"]')?.textContent ?? "")`), "image-alt is gone after the edit", 30000);
  const badgeAfter = await q(`return document.querySelector("#drawer-tab-a11y .count")?.textContent.trim() ?? "0"`);
  check(Number(badgeAfter) === Number(badge) - 1, "after the hot update the checks ran again: image-alt fixed, one violation fewer", `${badge} -> ${badgeAfter}`);

  // --- Undo from the Code tab -----------------------------------------------------------------------------------------
  await q(`document.querySelector("#drawer-tab-code").click()`);
  await until(() => q(`return [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Undo patch" && !b.disabled)`), "Undo is enabled");
  await q(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Undo patch").click()`);
  await until(() => readFileSync(sourceFile, "utf8") === before, "Undo restores the file", 15000);
  check(true, "Undo patch restores the file byte for byte");
  await until(() => q(`return !document.querySelector('[data-part="patch-diff"]')`), "the diff is gone with nothing left to undo");
  check(true, "with nothing left to undo, the Code tab shows no patch");
  await q(`document.querySelector("#drawer-tab-a11y").click()`);
  await until(() => q(`return !!document.querySelector('[data-part="a11y-row"][data-rule="image-alt"]')`), "image-alt is back after Undo", 30000);
  check(true, "after Undo the checks find the missing alt again");

  // --- Re-run ---------------------------------------------------------------------------------------------------------
  await q(`document.querySelector('[data-part="a11y-rerun"]').click()`);
  await until(() => q(`return document.querySelector('[data-part="a11y-rerun"]').textContent.trim() === "Re-run" && /violation/.test(document.querySelector('[data-part="a11y-status"]').textContent)`), "Re-run finishes");
  check(true, "Re-run runs the checks again");

  if (arg("--shot")) {
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
} finally {
  if (readFileSync(sourceFile, "utf8") !== original) {
    writeFileSync(sourceFile, original);
    check(false, "the fixture is unchanged at the end", "restored it");
  }
  page.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
