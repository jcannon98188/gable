// Driven check of the canvas and panel polish (TASK-56.12). Start the Designer backend and a Chromium (headless Edge, or the
// Tauri/WebView2 window) with a debugging port, then:
//
//   node e2e/polish-check.mjs --port 9444 --shell 127.0.0.1:5190 --project <dir> [--tailwind <file>] [--shot dir]
//
// Without --tailwind it expects examples/todomvc (page mode with a hash router): Back/Forward, text size, the template
// outline, Sync's mirrored selection, drag-insert from the Insert tab and a Problems quick fix. With --tailwind it expects a
// Tailwind v4 project (examples/ui-gallery) whose <file> holds `<h1 class="text-2xl font-semibold tracking-tight">`: the
// class conflict callout and its fix, and the read-only hatch on a bound class list
// ([attr.class]; [class.x] stays editable). Both modes then write a template that does not compile and expect the banner
// over the canvas, the stale hatch and the error in Problems, all cleared once it is fixed. Every file it edits is restored.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect, connectBrowser } from "./cdp.mjs";

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const port = Number(arg("--port", "9444"));
const shellPart = arg("--shell", "127.0.0.1:5190");
const project = arg("--project", "examples/todomvc");
const tailwind = arg("--tailwind", "");
const shotDir = arg("--shot", "");
let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const blank = (await connect(port, "about:blank").catch(() => null)) ?? (await connect(port, shellPart).catch(() => null));
if (blank) {
  await blank.cdp("Page.navigate", { url: `http://${shellPart}/` });
  await blank.sleep(2500);
}
const page = await connect(port, shellPart);
const browser = await connectBrowser(port);
const { ev, sleep, until, cdp } = page;
const shot = async (name) => {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(`${shotDir}/${name}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
};
const text = () => ev("document.body.innerText");
const q = (sel) => JSON.stringify(sel);
const exists = (sel) => ev(`!!document.querySelector(${q(sel)})`);
const clickSel = (sel) => ev(`(() => { const el = document.querySelector(${q(sel)}); if (!el) return false; el.click(); return true; })()`);
const clickText = (t) => ev(`(() => { const b = [...document.querySelectorAll("button,[role=tab]")].find(b => b.textContent.trim() === ${q(t)}); if (!b) return false; b.click(); return true; })()`);
/** The preview frames, in board order (each has its own origin: localhost, f1.localhost, ...). */
const frames = async () => (await browser.frames()).sort((a, b) => a.url.localeCompare(b.url));
const first = async () => (await frames()).find((f) => /\/\/localhost[:/]/.test(f.url)) ?? (await frames())[0];
const clickIn = (f, sel) => f.ev(`(() => { const el = document.querySelector(${q(sel)}); if (!el) return false; el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; })()`);
const overlayText = (f) => f.ev(`document.querySelector("[data-gable-designer]")?.innerText ?? ""`);
const restore = [];
const edit = (file, fn) => {
  const original = readFileSync(file, "utf8");
  restore.push(() => writeFileSync(file, original));
  const next = fn(original);
  if (next === original) throw new Error(`no change made to ${file}`);
  writeFileSync(file, next);
};
/**
 * Writes a template that does not compile (`to` in place of `from` in `file`) and expects the Designer to say so: the banner
 * over the canvas with file:line:column and the message, the "last good version" note once the page has refused the update,
 * the error in Problems, and the selected element hatched "stale". With the file restored, all of it clears.
 */
const compileError = async (file, from, to, selector) => {
  const original = readFileSync(file, "utf8");
  const line = original.slice(0, original.indexOf(from)).split("\n").length;
  const name = file.replace(/\\/g, "/").split("/").pop();
  edit(file, (s) => s.replace(from, to));
  await until(() => exists('[data-part="compile-error"]'), "the compile error banner", 20000);
  // the page's own rollback (no line) may be shown first; the backend's check names the line a moment later
  const whereText = () => ev(`document.querySelector('[data-part="compile-where"]')?.textContent ?? ""`);
  await until(async () => /:\d+:\d+$/.test(await whereText()), "the error located (file:line:column)", 20000);
  const where = await whereText();
  const banner = () => ev(`document.querySelector('[data-part="compile-error"]')?.innerText.replace(/\\s+/g, " ") ?? ""`);
  check(where.endsWith(`${name}:${line}:${where.split(":").pop()}`) && /Interpolation in attribute "class" is not supported/.test(await banner()), "a template that does not compile is named over the canvas: file:line:column and the message", `${where} · ${await banner()}`);
  await until(async () => /last good version/.test(await banner()), "the 'last good version' note", 20000);
  check(true, "once the page refuses the hot update the banner says the canvas shows the last good version");
  await shot("compile-error");
  await clickIn(await first(), selector);
  await until(async () => /🔒 \S+ · stale/.test(await overlayText(await first())), "the stale hatch", 15000);
  check(true, "the selected element of the template that does not compile is hatched 'stale'", (await overlayText(await first())).replace(/\s+/g, " "));
  await clickSel('[data-part="compile-problems"]');
  await until(async () => (await ev(`document.querySelector("ui-virtual-table")?.innerText ?? ""`)).includes("Interpolation in attribute"), "the error in Problems", 15000);
  check(true, "Show in Problems opens the drawer on the error");
  restore.pop()();
  await until(async () => !(await exists('[data-part="compile-error"]')), "the banner gone", 20000);
  check(true, "with the template fixed the banner clears");
  await until(async () => !(await ev(`document.querySelector("ui-virtual-table")?.innerText ?? ""`)).includes("Interpolation in attribute"), "the error gone from Problems", 20000);
  check(true, "and the error leaves Problems");
  await sleep(2000);
  await clickIn(await first(), selector);
  await until(async () => !/🔒/.test(await overlayText(await first())), "the stale hatch gone", 15000);
  check(true, "the element is editable again: no hatch");
};
const mouse = (type, x, y) => cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });

try {
  await until(async () => (await text()).includes("Connected"), "the shell is connected");
  await until(async () => (await text()).includes("live"), "a live frame");
  await sleep(1500);

  if (tailwind) {
    // --- AC1: class conflict callout with a fix -----------------------------------------------------------------------------
    edit(tailwind, (s) => s.replace('<h1 class="text-2xl font-semibold tracking-tight">', '<h1 class="text-2xl font-semibold tracking-tight p-2 p-8">'));
    await sleep(3000);
    await clickText("Style");
    await clickIn(await first(), "main h1");
    await until(() => exists('[data-part="class-conflict"]'), "a conflict callout");
    const callout = await ev(`document.querySelector('[data-part="class-conflict"]').innerText.replace(/\\s+/g, " ")`);
    check(/p-2.*p-8|p-8.*p-2/.test(callout) && (await ev(`document.querySelector('[data-part="class-conflict"]').dataset.loser`)) === "p-2", "p-2 next to p-8 is flagged: p-8 wins, p-2 is the one to remove", callout);
    await shot("conflict");
    await clickSel('[data-part="conflict-fix"]');
    await until(() => /tracking-tight p-8"/.test(readFileSync(tailwind, "utf8")), "the losing class removed");
    check(true, "the callout's fix removes the losing class from the source (one undoable edit)");
    await sleep(1500);
    check(!(await exists('[data-part="class-conflict"]')), "no callout once the conflict is gone");

    // --- AC1: the read-only hatch -------------------------------------------------------------------------------------------
    // [attr.class] sets the whole class list at runtime, so editing the written classes would be overwritten: read-only.
    edit(tailwind, (s) =>
      s
        .replace(/<h1 class="[^"]*">/, `<h1 class="text-2xl" [attr.class]="headingClass()">`)
        .replace("  dialogOpen = signal(false);", "  dialogOpen = signal(false);\n  headingClass = computed(() => (this.dialogOpen() ? 'text-2xl opacity-50' : 'text-2xl'));"),
    );
    await sleep(3000);
    await clickIn(await first(), "main h1");
    const f = await first();
    await until(async () => /🔒 h1\S* · dynamic/.test(await overlayText(f)), "the hatch chip");
    const hatch = await f.ev(`[...document.querySelectorAll("[data-gable-designer] div")].some(d => d.style.background.includes("repeating-linear-gradient") && d.style.outline.includes("dashed"))`);
    check(hatch, "an element whose class list is bound ([attr.class]) is drawn read-only on the canvas: amber dashed outline, hatch and lock chip", (await overlayText(f)).replace(/\s+/g, " "));
    check(!(await exists('[data-part="compile-error"]')), "valid Gable: no compile error banner");
    await until(() => exists('[data-part="conditional"]'), "the binding listed as conditional");
    await shot("hatch");
    restore.pop()();
    await sleep(3000);

    // [class.x]="cond" only toggles one class: the written list next to it stays editable, so no hatch
    edit(tailwind, (s) => s.replace(/<h1 class="[^"]*">/, `<h1 class="text-2xl font-semibold" [class.opacity-50]="dialogOpen()">`));
    await sleep(3000);
    await clickIn(await first(), "main h1");
    await until(async () => (await ev(`document.querySelector('[data-part="conditional"]')?.textContent ?? ""`)).includes("opacity-50"), "[class.opacity-50] listed as conditional");
    await sleep(1000);
    check(/h1/.test(await overlayText(await first())) && !/🔒/.test(await overlayText(await first())), "[class.x] keeps the written class list editable: no hatch", (await overlayText(await first())).replace(/\s+/g, " "));
    restore.pop()();
    await sleep(3000);
    await clickIn(await first(), "main h1");
    await until(async () => /h1/.test(await overlayText(await first())) && !/🔒/.test(await overlayText(await first())), "the hatch gone");
    check(true, "with the class list plain text again the element is editable, no hatch");

    // --- TASK-56.14: a template that does not compile -----------------------------------------------------------------------
    await compileError(tailwind, '<h1 class="text-2xl font-semibold tracking-tight p-8">', '<h1 class="text-2xl {{ dialogOpen() }}">', "main h1");
  } else {
    const appFile = join(project, "src/components/todo-app.ts");
    const f = await first();

    // --- AC2: Back and Forward ----------------------------------------------------------------------------------------------
    check(await ev(`document.querySelector('[data-part="page-back"]').disabled`), "Back is disabled before any navigation");
    const go = async (url) => {
      await ev(`(() => { const i = document.querySelector('input[aria-label="URL"]'); i.value = ${q(url)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await clickText("Go");
      await until(async () => (await f.ev("location.hash")) === `#${url}`, `the frame at ${url}`);
      await sleep(400);
    };
    await go("/active");
    await go("/completed");
    check(!(await ev(`document.querySelector('[data-part="page-back"]').disabled`)), "Back is enabled after navigating");
    await clickSel('[data-part="page-back"]');
    await until(async () => (await f.ev("location.hash")) === "#/active", "back to /active");
    check(true, "Back returns the frame to the previous route", await f.ev("location.hash"));
    await sleep(400);
    check(!(await ev(`document.querySelector('[data-part="page-forward"]').disabled`)), "Forward is enabled after going back (arriving does not cut the list)");
    await clickSel('[data-part="page-forward"]');
    await until(async () => (await f.ev("location.hash")) === "#/completed", "forward to /completed");
    check(true, "Forward goes to the next route again");
    await go("/");

    // --- AC1: text size -----------------------------------------------------------------------------------------------------
    const rootSize = () => f.ev(`parseFloat(getComputedStyle(document.documentElement).fontSize)`);
    const base = await rootSize();
    await ev(`(() => { const s = document.querySelector('[data-part="text-scale"]'); s.value = "1.5"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await until(async () => Math.abs((await rootSize()) - base * 1.5) < 0.5, "root font size scaled");
    check(true, "the text size control scales the frame's root font size", `${base}px → ${await rootSize()}px`);
    await ev(`(() => { const s = document.querySelector('[data-part="text-scale"]'); s.value = "1"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await until(async () => Math.abs((await rootSize()) - base) < 0.5, "root font size back");
    check(true, "100% puts it back");

    // --- AC2: template outline in Structure ---------------------------------------------------------------------------------
    await clickText("Structure");
    await clickIn(f, "h1");
    await until(() => exists('[data-part="template-outline"] [data-part="outline-row"]'), "outline rows");
    const rows = await ev(`[...document.querySelectorAll('[data-part="outline-row"]')].map(r => r.dataset.kind + ":" + r.innerText.replace(/\\s+/g, " ").trim())`);
    check(rows.some((r) => /^element:section\.todoapp/.test(r)) && rows.some((r) => /^block:@if/.test(r)) && rows.some((r) => /^element:input\.new-todo/.test(r)), "the selected element's template is outlined: elements with classes, and control-flow blocks", rows.slice(0, 6).join(" | "));
    check(await exists('[data-part="outline-row"].sel'), "the selected element's row is marked");
    await ev(`[...document.querySelectorAll('[data-part="outline-row"]')].find(r => /^input\\.new-todo/.test(r.innerText.trim())).click()`);
    await until(() => ev(`/^input\.new-todo/.test(document.querySelector('[data-part="outline-row"].sel')?.innerText.trim() ?? "")`), "the input selected from the outline");
    check(true, "clicking an outline row selects that element on the canvas");
    await shot("outline");

    // --- AC1: Sync mirrors the selection --------------------------------------------------------------------------------------
    await clickText("Add frame");
    await until(async () => (await frames()).length >= 2 && (await text()).split("live").length - 1 >= 2, "two live frames");
    await sleep(1500);
    const fresh = await first();
    await ev(`(() => { const l = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith("Sync")); const c = l.querySelector("input[type=checkbox]"); if (!c.checked) c.click(); })()`);
    await clickIn(fresh, "h1");
    await until(() => ev(`/selected in 2 of 2 frames/.test(document.querySelector('[data-part="sync-selection"]')?.innerText ?? "")`), "the sync chip");
    check(true, "with Sync on the device bar says where the selection is shown", await ev(`document.querySelector('[data-part="sync-selection"]').innerText`));
    const other = (await frames()).find((x) => x.url !== fresh.url);
    const mirrored = await other.ev(`[...document.querySelectorAll("[data-gable-designer] div")].some(d => d.style.border.includes("dashed") && d.getBoundingClientRect().width > 0)`);
    check(mirrored, "the other frame draws the mirrored selection");
    await shot("sync");
    await ev(`(() => { const l = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith("Sync")); const c = l.querySelector("input[type=checkbox]"); if (c.checked) c.click(); })()`);
    await until(async () => !(await exists('[data-part="sync-selection"]')), "the chip goes with Sync off");
    check(true, "turning Sync off removes the mirrored selection chip");
    await ev(`[...document.querySelectorAll("button[aria-label^='Close ']")].filter(b => !b.disabled).pop()?.click()`);
    await until(async () => (await frames()).length === 1, "back to one frame");

    // --- AC2: drag-insert from the Insert tab -------------------------------------------------------------------------------
    await clickText("Insert");
    // plain HTML: a <p> (dropping the project's own TodoApp into its own template would recurse)
    await ev(`[...document.querySelectorAll('[data-part="insert-sources"] button')].find(b => b.textContent.trim() === "HTML")?.click()`);
    await until(() => exists('[data-insert="p"]'), "the HTML entries");
    const entry = await ev(`(() => { const b = document.querySelector('[data-insert="p"]'); const r = b.getBoundingClientRect(); return { name: b.dataset.insert, tag: (/^<([a-z0-9-]+)/i.exec(b.title) ?? [])[1] ?? "", x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const target = await ev(`(() => { const fr = [...document.querySelectorAll(".frame[data-frame-id]")][0]; const r = fr.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width }; })()`);
    const h1 = await (await first()).ev(`(() => { const r = document.querySelector("h1").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.9, w: innerWidth }; })()`);
    const scale = target.width / h1.w;
    const dropX = target.left + h1.x * scale;
    const dropY = target.top + h1.y * scale;
    const before = readFileSync(appFile, "utf8");
    await mouse("mousePressed", entry.x, entry.y);
    for (let i = 1; i <= 8; i++) await mouse("mouseMoved", entry.x + ((dropX - entry.x) * i) / 8, entry.y + ((dropY - entry.y) * i) / 8);
    await until(() => ev(`/After <h1>/.test(document.querySelector('[data-part="drag-ghost"]')?.innerText ?? "")`), "the ghost names the drop place");
    check(true, "while dragging, the ghost names where the entry will go", await ev(`document.querySelector('[data-part="drag-ghost"]').innerText.replace(/\\s+/g, " ")`));
    const fr = await first();
    const line = await until(() => fr.ev(`/After <h1>/.test(document.querySelector("[data-gable-designer]")?.innerText ?? "")`), "the insertion line", 5000).catch(() => false);
    check(line, "the frame draws the insertion line and its label");
    await shot("drag");
    await mouse("mouseReleased", dropX, dropY);
    restore.push(() => writeFileSync(appFile, before));
    await until(() => readFileSync(appFile, "utf8") !== before, "the insert written");
    await sleep(500);
    const after = readFileSync(appFile, "utf8");
    const h1End = after.indexOf("</h1>");
    const next = after.slice(h1End + 5, h1End + 120).trimStart();
    check(next.startsWith("<p>Paragraph</p>"), "dropping <p> in the bottom quarter of the <h1> inserts it right after the heading in the source", JSON.stringify(after.slice(h1End, h1End + 60)));
    check(!(await exists('[data-part="drag-ghost"]')), "the ghost is gone after the drop");
    writeFileSync(appFile, before);
    await sleep(2500);

    // --- AC2: a Problems quick fix ------------------------------------------------------------------------------------------
    edit(appFile, (s) => s.replace("{{ store.itemWord() }} left", "{{ store.itemWord }} left"));
    await sleep(2000);
    // the drawer tab carries a count badge ("Problems 1"); a click on the open tab may collapse the drawer, so click until open
    await until(async () => {
      if (!(await exists("[data-problems-filter]"))) await ev(`[...document.querySelectorAll("button,[role=tab]")].find(b => /^Problems\\b/.test(b.textContent.trim()))?.click()`);
      await sleep(300);
      return exists("[data-problems-filter]");
    }, "the Problems tab open");
    await until(async () => {
      await clickText("Refresh");
      await sleep(2000);
      return exists('[data-part="problem-fix"]');
    }, "a quick fix listed", 90000);
    const label = await ev(`document.querySelector('[data-part="problem-fix"]').innerText`);
    check(/Call the signal/.test(label), "the Problems tab lists the language service's quick fix", label);
    await shot("problems");
    await clickSel('[data-part="problem-fix"]');
    await until(() => readFileSync(appFile, "utf8").includes("{{ store.itemWord() }} left"), "the fix applied");
    check(true, "Fix applies the quick fix to the source");
    await until(async () => (await text()).includes("Undo"), "undo offered");
    await sleep(1500);

    // --- TASK-56.14: a template that does not compile -----------------------------------------------------------------------
    await compileError(appFile, "<h1>todos</h1>", '<h1 class="x {{ draft() }}">todos</h1>', "h1");
  }
} catch (e) {
  console.log(`FAIL  ${e.message}`);
  console.log((await text().catch(() => "")).replace(/\s+/g, " ").slice(0, 600));
  console.log("drawer:", await ev(`document.querySelector("[data-problems-filter]")?.closest("app-problems-tab, [class]")?.parentElement?.innerText.replace(/\\s+/g, " ").slice(0, 800) ?? "(Problems tab not open)"`).catch(String));
  console.log("overlay:", await first().then(overlayText).catch((x) => String(x)));
  failed++;
} finally {
  for (const r of restore.reverse()) r();
  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}
