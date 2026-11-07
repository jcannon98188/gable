// Driven check of the drawer's Storage panel and the Network log's filters (TASK-56.21): the selected frame's
// localStorage, sessionStorage and cookies are listed live as the app changes them; items are added, edited, renamed,
// deleted and cleared from the panel (the Designer's own keys are left out and kept); cookies are listed with their
// attributes, HttpOnly ones included, over CDP (without CDP the page's cookies only, saying so), and set and deleted; the
// MCP storage tools do the same; and the Network log filters by text, kind and failure (panel and get_network).
//
//   npm run build -w packages/designer && node packages/designer/e2e/storage-check.mjs [--browser <path>] [--shot <file>]
//   node packages/designer/e2e/storage-check.mjs --no-cdp     # a backend without CDP: HttpOnly cookies are unavailable
//
// It runs against test-fixtures/net-app (a theme kept in localStorage; a sign-in whose response sets an HttpOnly `sid` and
// a plain `seen` cookie) and writes no project file. It starts the backend (with --cdp-port unless --no-cdp) and a headless
// Edge on a fresh profile, and stops exactly the processes it started (each by its PID, with its own child tree).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  profile = mkdtempSync(join(tmpdir(), "gable-storage-check-"));
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

/** Evaluates in the preview frame (the selected one: the project's own origin). */
const inFrame = async (js) => {
  const frame = (await browser.frames()).find((f) => f.url.includes(previewHost));
  if (!frame) throw new Error("the preview frame is not there");
  return frame.ev(js);
};
const frameText = () => inFrame(`document.body.innerText`).catch(() => "");
const text = (part) => q(`return document.querySelector('[data-part="${part}"]')?.textContent.replace(/\\s+/g, " ").trim() ?? null`);
const has = (part) => q(`return !!document.querySelector('[data-part="${part}"]')`);
const click = (part) => q(`const b = document.querySelector('[data-part="${part}"]'); if (!b) return false; b.click(); return true`);
const setField = (part, value, event = "input") => q(`const i = document.querySelector('[data-part="${part}"]'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); return true`);
/** The Storage panel's rows: `{ name, value, meta }`. */
const rows = () =>
  q(`return [...document.querySelectorAll('[data-part="st-row"]')].map((r) => { const c = [...r.querySelectorAll('[role="cell"]')].map((x) => x.textContent.trim()); return { name: r.dataset.name, value: c[1], meta: c[2] }; })`);
const row = async (name) => (await rows()).find((r) => r.name === name);
const rowButton = (name, part) => q(`const r = [...document.querySelectorAll('[data-part="st-row"]')].find((r) => r.dataset.name === ${JSON.stringify(name)}); if (!r) return false; r.querySelector('[data-part="${part}"]').click(); return true`);
const area = async (label) => {
  await q(`[...document.querySelectorAll('[data-part="st-area"] button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`);
  await until(async () => (await q(`return document.querySelector('[data-part="st-table"]')?.getAttribute("aria-label")`)) === label, `the ${label} area shows`);
};
const areaLabels = () => q(`return [...document.querySelectorAll('[data-part="st-area"] button')].map((b) => b.textContent.trim())`);
const tab = (value) => q(`document.querySelector("#drawer-tab-${value}").click(); return true`);
const frameLocal = (key) => inFrame(`localStorage.getItem(${JSON.stringify(key)})`);
const frameSession = (key) => inFrame(`sessionStorage.getItem(${JSON.stringify(key)})`);
const frameCookies = () => inFrame(`document.cookie`);

try {
  await until(() => ev(`!!document.body?.innerText.includes("Connected")`), "the shell is connected", 90000);
  const mcp = new Client({ name: "storage-check", version: "1" });
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
  // The app is clicked in the frame, as a person would in Interact mode.
  check((await call("set_mode", { mode: "interact" })).body.mode === "interact", "the canvas is in Interact mode");
  await until(async () => (await q(`return !!document.querySelector("#drawer-tab-http")`)), "the drawer's tabs are there", 20000);
  check((await q(`return document.querySelector("#drawer-tab-http").textContent.trim()`)) === "Network", "the drawer's request tab is labelled Network");
  await until(async () => (await q(`return !!document.querySelector("app-storage-panel")`)) || (await tab("storage"), false), "the Storage panel opens", 20000);
  await until(async () => (await frameText()).includes("Theme: light"), "the app is running", 30000);
  const frameOrigin = await inFrame("location.origin");
  await until(async () => (await text("st-origin")) === frameOrigin, "the panel names the frame's origin", 15000);
  check(true, "the Storage panel reads the selected frame's origin", frameOrigin);
  check((await areaLabels()).join(" | ").startsWith("Local storage (0) | Session storage ("), "the areas carry their counts", (await areaLabels()).join(" | "));
  check((await text("st-empty"))?.startsWith("No items"), "an empty localStorage says so", await text("st-empty"));

  // --- live: the app's own writes appear --------------------------------------------------------------------------------
  await inFrame(`document.querySelector('[data-test="dark"]').click()`);
  await until(async () => (await row("theme"))?.value === "dark", "the app's localStorage write appears without a refresh", 10000);
  check(true, "the app's localStorage write appears live");
  check((await row("theme")).meta === "4 chars", "the row gives the value's length", (await row("theme")).meta);

  // --- add, edit, rename, delete ----------------------------------------------------------------------------------------
  await click("st-add");
  await until(() => has("st-key"), "the add dialog opens");
  await setField("st-key", "added");
  await setField("st-value-input", '{"n":1}');
  await click("st-submit");
  await until(async () => (await frameLocal("added")) === '{"n":1}', "the added item is in the frame", 10000);
  await until(async () => !!(await row("added")), "the added item is listed");
  check(true, "an item added in the panel is written into the frame's localStorage");

  await rowButton("theme", "st-row-edit");
  await until(async () => (await q(`return document.querySelector('[data-part="st-value-input"]')?.value`)) === "dark", "the edit dialog shows the value");
  await setField("st-value-input", "solar");
  await click("st-submit");
  await until(async () => (await frameLocal("theme")) === "solar", "the edited value is in the frame", 10000);
  await until(async () => (await row("theme"))?.value === "solar", "the row shows the edited value");
  check(true, "an item edited in the panel is written into the frame");

  await rowButton("added", "st-row-edit");
  await until(async () => (await q(`return document.querySelector('[data-part="st-key"]')?.value`)) === "added", "the edit dialog shows the key");
  await setField("st-key", "renamed");
  await click("st-submit");
  await until(async () => (await frameLocal("renamed")) === '{"n":1}' && (await frameLocal("added")) === null, "the rename moved the value", 10000);
  await until(async () => !!(await row("renamed")) && !(await row("added")), "the list shows the new key only");
  check(true, "renaming an item writes the new key and removes the old one");

  await rowButton("renamed", "st-row-remove");
  await until(async () => (await frameLocal("renamed")) === null && !(await row("renamed")), "the deleted item is gone", 10000);
  check(true, "an item deleted in the panel is removed from the frame");

  await setField("st-filter", "SOL");
  await until(async () => (await rows()).map((r) => r.name).join() === "theme", "the filter keeps matching values");
  await setField("st-filter", "nothing-like-this");
  await until(async () => (await text("st-empty")) === "Nothing matches the filter", "a filter with no match says so");
  await setField("st-filter", "");
  check(true, "the filter matches names and values");

  // --- sessionStorage: the Designer's own keys stay out and survive a clear ---------------------------------------------
  await inFrame(`sessionStorage.setItem("__gable_designer_probe", "kept"); sessionStorage.setItem("draft", "hello"); sessionStorage.setItem("step", "2"); true`);
  await area("Session storage");
  await until(async () => (await row("draft"))?.value === "hello" && !!(await row("step")), "the app's sessionStorage writes appear", 10000);
  check(!(await rows()).some((r) => /^(__gable_designer|gable-designer)/.test(r.name)), "the Designer's own keys are not listed", (await rows()).map((r) => r.name).join());
  check(/^\d+ keys? of the Designer's own/.test((await text("st-hidden")) ?? ""), "the panel counts the Designer's keys it leaves out", await text("st-hidden"));
  await click("st-clear");
  await until(() => has("st-clear-confirm"), "the clear dialog opens");
  check(/^Clear 2 items of sessionStorage\?/.test(await q(`return [...document.querySelectorAll("h2")].map((h) => h.textContent.trim()).find((t) => t.startsWith("Clear")) ?? ""`)), "Clear asks first, naming how many items");
  await click("st-clear-confirm");
  await until(async () => (await frameSession("draft")) === null && (await frameSession("step")) === null, "the clear removed the app's items", 10000);
  check((await frameSession("__gable_designer_probe")) === "kept", "the clear kept the Designer's own keys");
  await until(async () => (await text("st-empty"))?.startsWith("No items"), "the area shows empty");

  // --- cookies --------------------------------------------------------------------------------------------------------
  await inFrame(`document.querySelector('[data-test="login"]').click()`);
  await until(async () => (await frameText()).includes("Signed in"), "the app signs in", 10000);
  await area("Cookies");
  await until(async () => !!(await row("seen")), "the response's cookie is listed", 10000);
  const seen = await row("seen");
  check(/third-party iframe/.test((await text("st-third-party")) ?? ""), "the panel says the frame is a third-party iframe in this window (only SameSite=None cookies work)", (await text("st-third-party"))?.slice(0, 80));
  if (noCdp) {
    check(/HttpOnly unavailable/.test((await text("st-cookies-via")) ?? ""), "without CDP the panel says HttpOnly cookies are unavailable", await text("st-cookies-via"));
    check(!(await row("sid")), "without CDP the HttpOnly cookie is not listed (the page cannot see it)");
    check(seen.meta === "attributes need CDP" || /attributes need CDP/.test(seen.meta), "without CDP a cookie says its attributes need CDP", seen.meta);
  } else {
    check(/CDP/.test((await text("st-cookies-via")) ?? "") && !/unavailable/.test(await text("st-cookies-via")), "with CDP the panel lists every cookie of the frame", await text("st-cookies-via"));
    const sid = await row("sid");
    check(sid?.value === "s3ss10n" && /HttpOnly/.test(sid.meta) && /Secure/.test(sid.meta) && /SameSite=None/.test(sid.meta) && /session/.test(sid.meta), "the HttpOnly session cookie is listed with its attributes", sid?.meta);
    check(!(await frameCookies()).includes("sid="), "the page itself cannot read it (it is HttpOnly)");
    check(/ \/ · session · /.test(seen.meta) && !/HttpOnly/.test(seen.meta), "a plain cookie shows domain, path and expiry", seen.meta);
  }

  await click("st-add");
  await until(() => has("st-c-name"), "the cookie dialog opens");
  check(noCdp ? (await has("st-c-httponly-off")) && !(await has("st-c-httponly")) : (await has("st-c-httponly")) && (await has("st-c-domain")), noCdp ? "without CDP the dialog marks HttpOnly unavailable" : "with CDP the dialog offers HttpOnly and domain");
  await setField("st-c-name", "flavor");
  await setField("st-c-value", "oat");
  await setField("st-c-maxage", "3600");
  // A third-party iframe keeps only SameSite=None; Secure cookies (see st-third-party): the dialog starts there.
  check((await q(`return document.querySelector('[data-part="st-c-samesite"]').value`)) === "None" && (await q(`return document.querySelector('[data-part="st-c-secure"] input').checked`)), "in a third-party frame a new cookie defaults to SameSite=None; Secure");
  await click("st-c-submit");
  await until(async () => (await frameCookies()).includes("flavor=oat"), "the cookie reaches the page", 10000);
  await until(async () => (await row("flavor"))?.value === "oat", "the new cookie is listed");
  if (!noCdp) check(/UTC/.test((await row("flavor")).meta), "the cookie's expiry is shown", (await row("flavor")).meta);
  check(true, "a cookie added in the panel is set for the frame");

  if (!noCdp) {
    await click("st-add");
    await until(() => has("st-c-name"), "the cookie dialog opens again");
    await setField("st-c-name", "hidden");
    await setField("st-c-value", "h1");
    await q(`document.querySelector('[data-part="st-c-httponly"] input').click(); return true`);
    await click("st-c-submit");
    await until(async () => /HttpOnly/.test((await row("hidden"))?.meta ?? ""), "the HttpOnly cookie is listed", 10000);
    check(!(await frameCookies()).includes("hidden="), "an HttpOnly cookie set over CDP is listed, and hidden from the page");
    await rowButton("hidden", "st-row-remove");
    await until(async () => !(await row("hidden")), "the HttpOnly cookie is deleted", 10000);
    check(true, "an HttpOnly cookie is deleted over CDP");
  }

  await rowButton("flavor", "st-row-edit");
  await until(async () => (await q(`return document.querySelector('[data-part="st-c-value"]')?.value`)) === "oat", "the cookie editor shows the value");
  await setField("st-c-value", "rye");
  await click("st-c-submit");
  await until(async () => (await frameCookies()).includes("flavor=rye") && (await row("flavor"))?.value === "rye", "the edited cookie is written", 10000);
  check(true, "a cookie edited in the panel is rewritten");
  await rowButton("flavor", "st-row-remove");
  await until(async () => !(await frameCookies()).includes("flavor=") && !(await row("flavor")), "the cookie is deleted", 10000);
  check(true, "a cookie deleted in the panel is gone from the page");
  check(!(await has("st-action-error")), "no action failed", await text("st-action-error"));

  // --- MCP ---------------------------------------------------------------------------------------------------------------
  const all = await call("get_storage", {});
  check(!all.error && all.body.origin === frameOrigin && all.body.localStorage.some((i) => i.key === "theme" && i.value === "solar") && all.body.cookiesVia === (noCdp ? "page" : "cdp"), "get_storage reads the frame's storage and says where the cookies came from", JSON.stringify({ origin: all.body.origin, via: all.body.cookiesVia }));
  check(noCdp ? !all.body.cookies.some((c) => c.name === "sid") && /CDP/.test(all.body.note ?? "") : all.body.cookies.some((c) => c.name === "sid" && c.httpOnly === true && c.expires === "session"), noCdp ? "without CDP get_storage lists the page's cookies and says why" : "get_storage lists the HttpOnly cookie with its attributes");
  check(!all.body.sessionStorage.some((i) => i.key.startsWith("__gable_designer")) && all.body.designerKeysHidden >= 1, "get_storage leaves the Designer's keys out and counts them");
  const set = await call("set_storage_item", { area: "local", key: "fromMcp", value: "x".repeat(40) });
  check(!set.error && (await frameLocal("fromMcp")) === "x".repeat(40), "set_storage_item writes into the frame");
  await area("Local storage");
  await until(async () => !!(await row("fromMcp")), "the panel shows the MCP write", 10000);
  const cut = await call("get_storage", { area: "local", filter: "frommcp", maxValue: 10 });
  check(cut.body.localStorage.length === 1 && cut.body.localStorage[0].truncated === 40 && !("cookies" in cut.body), "get_storage filters, cuts long values and returns only the area asked", JSON.stringify(cut.body.localStorage));
  const refused = await call("set_storage_item", { area: "session", key: "__gable_designer_probe", value: "x" });
  check(refused.error && /Designer/.test(String(refused.body)), "a Designer key cannot be written", String(refused.body).slice(0, 100));
  const removed = await call("remove_storage_item", { area: "local", key: "fromMcp" });
  check(!removed.error && (await frameLocal("fromMcp")) === null, "remove_storage_item removes it");
  await inFrame(`sessionStorage.setItem("again", "1"); true`);
  const cleared = await call("clear_storage", { area: "session" });
  check(!cleared.error && cleared.body.sessionStorage.length === 0 && (await frameSession("__gable_designer_probe")) === "kept", "clear_storage clears the area but keeps the Designer's keys");
  check(/third-party/.test(all.body.thirdParty ?? ""), "get_storage says the frame is a third-party iframe in this window");
  const ck = await call("set_cookie", { name: "mcp", value: "1", path: "/", maxAge: 600, sameSite: "None", secure: true });
  check(!ck.error && (await frameCookies()).includes("mcp=1"), "set_cookie sets a cookie for the frame", ck.error ? String(ck.body) : "");
  const lax = await call("set_cookie", { name: "lax", value: "1" });
  check(noCdp ? lax.error && /did not keep/.test(String(lax.body)) : !lax.error && !(await frameCookies()).includes("lax=1"), noCdp ? "a cookie the third-party frame cannot keep is reported, not silently dropped" : "over CDP a Lax cookie is stored but, third-party, not seen by the page", String(lax.body).slice(0, 120));
  if (!noCdp) await call("delete_cookie", { name: "lax" });
  const hoc = await call("set_cookie", { name: "mcpHidden", value: "1", httpOnly: true, sameSite: "None", secure: true });
  if (noCdp) check(hoc.error && /CDP/.test(String(hoc.body)), "without CDP set_cookie refuses httpOnly, saying why", String(hoc.body).slice(0, 120));
  else check(!hoc.error && hoc.body.cookies.some((c) => c.name === "mcpHidden" && c.httpOnly) && !(await frameCookies()).includes("mcpHidden"), "set_cookie sets an HttpOnly cookie over CDP");
  const del = await call("delete_cookie", { name: "mcp" });
  check(!del.error && !(await frameCookies()).includes("mcp=1"), "delete_cookie deletes it");
  if (!noCdp) {
    const delSid = await call("delete_cookie", { name: "sid" });
    check(!delSid.error && !delSid.body.cookies.some((c) => c.name === "sid"), "delete_cookie deletes the HttpOnly session cookie over CDP");
  }

  // --- the Network log's filters -----------------------------------------------------------------------------------------
  await inFrame(`fetch("/api/missing").catch(() => {}); true`);
  await tab("http");
  await until(() => q(`return !!document.querySelector("app-network-panel")`), "the Network panel opens");
  const logPaths = () => q(`return [...document.querySelectorAll('[data-part="net-log"] [role="row"]')].filter((r) => r.getAttribute("aria-rowindex") !== "1").map((r) => r.querySelectorAll('[role="gridcell"]')[2]?.textContent.trim())`);
  await until(async () => (await logPaths()).includes("/api/missing") && (await logPaths()).includes("/api/login"), "the requests are logged", 15000);
  await setField("net-filter", "login");
  await until(async () => (await logPaths()).join() === "/api/login", "the text filter keeps the login request", 10000);
  check(/^1 of \d+ request/.test((await q(`return document.querySelector("app-network-panel").innerText`)).match(/\d+ of \d+ requests?/)?.[0] ?? ""), "the count says how many are shown of how many");
  await setField("net-filter", "");
  await q(`document.querySelector('[data-part="net-failed"] input').click(); return true`);
  await until(async () => (await logPaths()).length > 0 && (await logPaths()).every((p) => p === "/api/missing"), "Failed only keeps the failed request", 10000);
  check(true, "the Failed-only switch keeps failed requests");
  await setField("net-kind", "xhr", "change");
  await until(async () => (await q(`return document.querySelector("app-network-panel").innerText`)).includes("No request matches the filters"), "no failed XHR: the panel says so", 10000);
  check(true, "filters combine, and an empty result says so");
  await q(`document.querySelector('[data-part="net-failed"] input').click(); return true`);
  await until(async () => (await logPaths()).length > 0 && (await logPaths()).every((p) => p === "/api/status"), "the XHR filter keeps the XMLHttpRequest", 10000);
  check(true, "the kind filter keeps one kind");
  await setField("net-kind", "", "change");

  const filtered = await call("get_network", { filter: "/api/missing" });
  check(!filtered.error && filtered.body.requests.length >= 1 && filtered.body.requests.every((r) => r.url.endsWith("/api/missing")) && filtered.body.filteredOut > 0, "get_network filters by text and says how many it left out", JSON.stringify({ n: filtered.body.requests?.length, out: filtered.body.filteredOut }));
  const failedOnly = await call("get_network", { failed: true });
  check(!failedOnly.error && failedOnly.body.requests.length >= 1 && failedOnly.body.requests.every((r) => r.status === 0 || r.status >= 400), "get_network keeps failed requests only", JSON.stringify(failedOnly.body.requests?.map((r) => r.status)));
  const xhrs = await call("get_network", { kind: "xhr" });
  check(!xhrs.error && xhrs.body.requests.length >= 1 && xhrs.body.requests.every((r) => r.kind === "xhr"), "get_network keeps one kind");
  await mcp.close();

  if (arg("--shot")) {
    await tab("storage");
    await sleep(1500);
    const { data } = (await page.cdp("Page.captureScreenshot", { format: "png" })).result;
    writeFileSync(arg("--shot"), Buffer.from(data, "base64"));
    console.log(`screenshot: ${arg("--shot")}`);
  }
} catch (e) {
  check(false, "the run finished", e instanceof Error ? e.message : String(e));
  console.log("panel:", await q(`return (document.querySelector("app-storage-panel") ?? document.querySelector("app-network-panel"))?.innerText.slice(0, 1500) ?? "(no panel)"`).catch(String));
  console.log("dialogs:", await q(`return [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText.slice(0, 400)).join(" || ")`).catch(String));
  console.log("frame:", (await frameText()).slice(0, 500));
  console.log("frame storage:", await inFrame(`JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie })`).catch(String));
} finally {
  check(JSON.stringify(srcFiles()) === srcBefore, "no project file was written");
  page.close();
  browser.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
