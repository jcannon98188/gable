// Driven check of design tokens (TASK-56.23): the Tokens tab lists the project's CSS custom properties with light and dark
// values (its own and gable-ui's theme.css), an edit there is one changed line in the stylesheet that the frame picks up and
// Undo takes back, a token's uses are counted and listed and each one selects its element, the Style tab names the tokens
// of the selected element, a package token is edited as an override in the project's stylesheet, and MCP list_tokens /
// get_token_usages / set_token do the same over HTTP.
//
//   npm run build -w packages/designer && node packages/designer/e2e/tokens-check.mjs [--browser <path>] [--shot <file>]
//
// It runs against test-fixtures/tokens-app and edits its src/styles.css, putting it back byte for byte (and failing if it
// could not). It starts the backend with --cdp-port and a headless Edge on that port, and stops exactly the processes it
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
const project = join(here, "..", "test-fixtures", "tokens-app");
const sheet = join(project, "src", "styles.css");
const original = readFileSync(sheet, "utf8");

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
  profile = mkdtempSync(join(tmpdir(), "gable-tokens-check-"));
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
const tok = (name) => `.tok[data-token=${JSON.stringify(name)}]`;
/** The Light or Dark value as the tab shows it. */
const shownValue = (name, scheme) => q(`return document.querySelector(${JSON.stringify(`${tok(name)} [data-scheme="${scheme}"] [data-part="token-value"]`)})?.textContent.replace(/\\s+/g, " ").trim() ?? null`);
/** Types a value into a token's inline field, as a user would, and presses Enter. */
async function typeValue(name, slotSelector, value) {
  await q(`document.querySelector(${JSON.stringify(`${tok(name)} ${slotSelector}`)}).click()`);
  await until(() => q(`return !!document.querySelector('input[data-part="token-input"]')`), `the inline field for ${name} opens`, 5000);
  await q(`const i = document.querySelector('input[data-part="token-input"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(value)});
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));`);
}
/** Evaluates in the preview frame (the one that serves the fixture). */
async function inFrame(js) {
  const frames = await browser.frames();
  const frame = frames.find((f) => f.url.startsWith("http") && !f.url.includes(target.shell)) ?? frames[0];
  if (!frame) return null;
  return frame.ev(`(() => { ${js} })()`).catch(() => null);
}
const cardBorder = () => inFrame(`const e = document.querySelector(".card"); return e && getComputedStyle(e).borderTopColor`);
const buttonBg = () => inFrame(`const e = document.querySelector("button"); return e && getComputedStyle(e).backgroundColor`);
const changedLines = (text) => {
  const a = original.split("\n");
  const b = text.split("\n");
  return { removed: a.filter((l) => !b.includes(l)), added: b.filter((l) => !a.includes(l)) };
};
const undo = async () => {
  await q(`document.querySelector('button[aria-label="Undo"]').click()`);
  await until(() => readFileSync(sheet, "utf8") === original, "Undo puts the stylesheet back", 10000);
};

let mcp = null;
try {
  await until(() => ev(`document.body.innerText.includes("Connected")`), "the shell is connected", 90000);
  await until(() => cardBorder(), "the fixture renders in the frame", 60000);

  // --- the Tokens tab lists tokens with light and dark values ---------------------------------------------------------
  await until(async () => (await q(`return !!document.querySelector(${JSON.stringify(tok("--brand"))})`)) || (await q(`[...document.querySelectorAll('[role="tab"], button')].find((b) => b.textContent.trim() === "Tokens")?.click(); return false`)), "the Tokens tab lists --brand", 30000);
  check((await shownValue("--brand", "light")) === "#ff0066", "--brand's light value is the :root one", await shownValue("--brand", "light"));
  check((await shownValue("--brand", "dark")) === "#ff6699", "--brand's dark value is the .dark one", await shownValue("--brand", "dark"));
  check((await shownValue("--space-card", "dark")) === "20px", "a prefers-color-scheme: dark value counts as dark too", await shownValue("--space-card", "dark"));
  const swatch = await q(`return getComputedStyle(document.querySelector(${JSON.stringify(`${tok("--brand")} [data-scheme="light"] .sw`)})).backgroundColor`);
  check(swatch === "rgb(255, 0, 102)", "colour tokens show a swatch of their value", swatch);
  check((await q(`return document.querySelector(${JSON.stringify(`${tok("--primary")} [data-part="token-package"]`)})?.textContent.trim()`)) === "@gable/ui", "gable-ui's theme.css tokens are listed and marked as a package's");
  check(/^oklch\(0\.205 0 0\)/.test((await shownValue("--primary", "light")) ?? "") && /override/.test((await shownValue("--primary", "light")) ?? ""), "a package token's light value says an edit writes an override", await shownValue("--primary", "light"));
  const source = await q(`return document.querySelector('[data-part="tokens-source"]').textContent`);
  check(source.includes("src/styles.css") && source.includes("@gable/ui/theme.css (read-only)") && source.includes("dark values from .dark"), "the tab says which stylesheets it read and where dark values come from", source);
  const uses = await q(`return document.querySelector(${JSON.stringify(`${tok("--brand")} [data-part="token-uses"]`)}).textContent.trim()`);
  check(uses === "3 uses", "--brand's uses are counted (the .card rule, an inline style, the text-brand class)", uses);

  // --- an edit is one changed line; the frame shows it; Undo takes it back --------------------------------------------
  check((await cardBorder()) === "rgb(255, 0, 102)", "the frame draws the card border with --brand", await cardBorder());
  await typeValue("--brand", '[data-scheme="light"] [data-part="token-value"]', "#00aa55");
  await until(() => readFileSync(sheet, "utf8").includes("--brand: #00aa55;"), "the light edit is written", 10000);
  const light = changedLines(readFileSync(sheet, "utf8"));
  check(light.removed.join() === "  --brand: #ff0066;" && light.added.join() === "  --brand: #00aa55;", "the edit changes exactly the :root line", `${light.removed} -> ${light.added}`);
  await until(async () => (await cardBorder()) === "rgb(0, 170, 85)", "the frame picks up the new value", 15000);
  check(true, "the frame redraws with the new token value (hot CSS update)");
  await until(async () => (await shownValue("--brand", "light")) === "#00aa55", "the tab shows the new value", 5000);
  check(true, "the tab shows the new value");
  const toast = await q(`return [...document.querySelectorAll('[aria-label="Notifications"] *')].map((e) => e.textContent).join(" ")`);
  check(/Set --brand \(:root\)/.test(toast) && /Undo/.test(toast), "a toast names the edit and offers Undo", toast.replace(/\s+/g, " ").slice(0, 120));
  await undo();
  check(true, "Undo restores the stylesheet byte for byte");
  await until(async () => (await cardBorder()) === "rgb(255, 0, 102)", "the frame is back to the old value", 15000);
  check(true, "the frame is back to the old value after Undo");

  await typeValue("--brand", '[data-scheme="dark"] [data-part="token-value"]', "#ffaaaa");
  await until(() => readFileSync(sheet, "utf8").includes("--brand: #ffaaaa;"), "the dark edit is written", 10000);
  const dark = changedLines(readFileSync(sheet, "utf8"));
  check(dark.removed.join() === "  --brand: #ff6699;" && /\.dark \{\n {2}--brand: #ffaaaa;/.test(readFileSync(sheet, "utf8")), "a dark edit changes the .dark definition only", `${dark.removed} -> ${dark.added}`);
  await undo();

  // Escape abandons an edit without writing.
  await q(`document.querySelector(${JSON.stringify(`${tok("--brand")} [data-scheme="light"] [data-part="token-value"]`)}).click()`);
  await until(() => q(`return !!document.querySelector('input[data-part="token-input"]')`), "the inline field opens", 5000);
  await q(`const i = document.querySelector('input[data-part="token-input"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "#123123"); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));`);
  await sleep(600);
  check(readFileSync(sheet, "utf8") === original && !(await q(`return !!document.querySelector('input[data-part="token-input"]')`)), "Escape closes the field and writes nothing");

  // --- uses: listed, and each selects its element -------------------------------------------------------------------------
  mcp = new Client({ name: "tokens-check", version: "1" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(target.ready.mcp.url), { requestInit: { headers: { authorization: `Bearer ${target.ready.mcp.token}` } } }));
  const call = async (name, args = {}) => {
    const r = await mcp.callTool({ name, arguments: args });
    const text = r.content.map((c) => c.text ?? "").join("\n");
    if (r.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
  const selectedTag = async () => (await call("get_selection")).selection?.tag ?? null;

  await q(`document.querySelector(${JSON.stringify(`${tok("--brand")} [data-part="token-uses"]`)}).click()`);
  await until(() => q(`return document.querySelectorAll(${JSON.stringify(`${tok("--brand")} [data-part="token-usage"]`)}).length === 3`), "the three uses are listed", 10000);
  const listed = await q(`return [...document.querySelectorAll(${JSON.stringify(`${tok("--brand")} [data-part="token-usage"]`)})].map((b) => b.dataset.kind + " " + b.textContent.replace(/\\s+/g, " ").trim())`);
  check(listed.some((l) => l.startsWith("css") && l.includes(".card { border }")) && listed.some((l) => l.startsWith("class") && l.includes("<h1> text-brand")) && listed.some((l) => l.startsWith("style") && l.includes("<p> style")), "the uses are the .card rule, the <h1>'s class and the <p>'s style", listed.join(" | "));
  for (const [kind, tag] of [["class", "h1"], ["style", "p"], ["css", "section"]]) {
    await q(`document.querySelector(${JSON.stringify(`${tok("--brand")} [data-part="token-usage"][data-kind="${kind}"]`)}).click()`);
    await until(async () => (await selectedTag()) === tag, `the ${kind} use selects its <${tag}>`, 10000);
    check(true, `jumping to the ${kind} use selects the <${tag}> on the canvas`);
  }

  // --- the selected element's tokens (Style tab and Tokens tab) -----------------------------------------------------------
  // The <p> selected before reads --brand only: wait for the section's list.
  const elementTokens = () => q(`return [...new Set([...document.querySelectorAll('[data-part="element-tokens"] [data-token]')].map((b) => b.dataset.token))]`);
  await until(async () => (await elementTokens()).includes("--space-card"), "the <section>'s tokens are shown", 10000).catch(() => undefined);
  const sectionTokens = await elementTokens();
  check(["--space-card", "--brand", "--radius"].every((n) => sectionTokens.includes(n)), "the <section class=card> reads --space-card, --brand and --radius", sectionTokens.join(", "));
  // A click on one opens it in the Tokens tab.
  await q(`document.querySelector('app-tokens-panel [data-part="element-tokens"] [data-token="--space-card"]').click()`);
  await until(() => q(`return document.querySelector(${JSON.stringify(`${tok("--space-card")} .tok-name`)})?.getAttribute("aria-expanded") === "true"`), "the token opens", 5000).catch(() => undefined);
  check(await q(`return document.querySelector(${JSON.stringify(`${tok("--space-card")} .tok-name`)})?.getAttribute("aria-expanded") === "true"`), "clicking an element's token opens it in the Tokens tab");
  const inStyleTab = await q(`return !!document.querySelector('app-tailwind-panel [data-part="element-tokens"]')`);
  check(inStyleTab, "the Style tab lists them too");

  // --- a package token: the edit is an override in the project's stylesheet ------------------------------------------------
  const bg0 = await buttonBg();
  await typeValue("--primary", '[data-scheme="light"] [data-part="token-value"]', "oklch(0.55 0.2 260)");
  await until(() => readFileSync(sheet, "utf8").includes("--primary: oklch(0.55 0.2 260);"), "the override is written", 10000);
  const over = changedLines(readFileSync(sheet, "utf8"));
  check(over.removed.length === 0 && over.added.join() === "  --primary: oklch(0.55 0.2 260);" && /:root \{\n {2}--brand: #ff0066;\n {2}--space-card: 16px;\n {2}--primary: oklch/.test(readFileSync(sheet, "utf8")), "editing a gable-ui token adds one override line to the project's :root (theme.css is untouched)", over.added.join());
  await until(async () => (await buttonBg()) !== bg0, "the bg-primary button picks up the override", 15000);
  check(true, "the bg-primary button picks up the override", `${bg0} -> ${await buttonBg()}`);
  await undo();

  // --- MCP over HTTP -------------------------------------------------------------------------------------------------------
  const listedMcp = await call("list_tokens", { filter: "brand" });
  const brand = listedMcp.tokens.find((t) => t.name === "--brand");
  check(brand?.light.value === "#ff0066" && brand?.dark.value === "#ff6699" && brand?.uses === 3, "list_tokens gives --brand's light and dark values and its uses", JSON.stringify({ light: brand?.light.value, dark: brand?.dark.value, uses: brand?.uses }));
  const used = await call("get_token_usages", { name: "--brand" });
  check(used.count === 3 && used.usages.some((u) => u.select?.selector === ".card"), "get_token_usages lists the uses with how to select each", used.usages.map((u) => u.kind).join(", "));
  const pos = used.usages.find((u) => u.kind === "class").select.target;
  await call("select_element", { target: pos });
  check((await selectedTag()) === "h1", "a usage's select.target works with select_element", JSON.stringify(pos));
  const set = await call("set_token", { name: "--brand", value: "#0a0a0a", scheme: "dark" });
  check(set.label === "Set --brand (.dark)" && readFileSync(sheet, "utf8").includes("--brand: #0a0a0a;"), "set_token writes the dark value", set.label);
  await until(async () => (await shownValue("--brand", "dark")) === "#0a0a0a", "the tab follows an MCP edit", 10000);
  check(true, "the Tokens tab follows an edit made over MCP");
  await call("undo");
  check(readFileSync(sheet, "utf8") === original, "MCP undo restores the stylesheet");

  if (arg("--shot")) {
    await q(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Tokens")?.click()`);
    await sleep(300);
    await q(`const b = document.querySelector(${JSON.stringify(`${tok("--brand")} .tok-name`)}); if (b.getAttribute("aria-expanded") !== "true") b.click(); b.scrollIntoView()`);
    await sleep(800);
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
  // What the shell showed when it stopped: the field, an error callout, the last toasts.
  const seen = await q(`return { field: document.querySelector('input[data-part="token-input"]')?.value ?? null, notice: document.querySelector('[data-part="tokens-notice"], [data-part="tokens-error"]')?.textContent ?? null, toasts: document.querySelector('[aria-label="Notifications"]')?.textContent.replace(/\\s+/g, " ").slice(0, 300) ?? null }`).catch((x) => String(x));
  console.log("shell state:", JSON.stringify(seen));
} finally {
  await mcp?.close().catch(() => undefined);
  if (readFileSync(sheet, "utf8") !== original) writeFileSync(sheet, original);
  check(readFileSync(sheet, "utf8") === original, "the fixture is byte-identical at the end");
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
