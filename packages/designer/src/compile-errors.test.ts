// TASK-56.14: templates that do not compile are named (file, line, message) instead of leaving the canvas silently stale,
// and a bound class list is read-only in the Style panel.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HmrEntry } from "@gable/core/devtools";
import { afterAll, describe, expect, it } from "vitest";
import { CompileChecks, checkFile, type CompileError } from "./server/compile-check.js";
import { isStale, modulePath, rolledBack, staleCanvas, staleNote } from "../shell/src/app/stale-canvas.js";
import { classListWritable, conditionalClasses } from "../shell/src/app/tailwind-state.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const component = (template: string) => `import { html, signal } from "@gable/core";

export class Demo {
  static meta = {
    selector: "app-demo",
    template: html\`
      ${template}
    \`,
  };
  open = signal(false);
}
`;

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "gable-compile-"));
  dirs.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("compile check (backend)", () => {
  it("names a template that does not compile with its file, line and column, and the literal it is in", () => {
    const root = project({ "src/demo.ts": component(`<h1 class="x {{ open() }}">Hi</h1>`) });
    const [e, ...rest] = checkFile(root, "src/demo.ts");
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ file: "src/demo.ts", line: 7, column: 18, rule: "template-syntax", message: 'Interpolation in attribute "class" is not supported; use [attr.class] or [class.name].' });
    expect(e!.raw).toContain('<h1 class="x {{ open() }}">');
    expect(e!.raw!.slice(e!.offset!)).toMatch(/^x \{\{ open\(\) \}\}/);
  });

  it("scans the project once, skips what is not source, and re-checks only the files a change touched", () => {
    const root = project({
      "src/ok.ts": component(`<p [class.on]="open()">ok</p>`),
      "src/bad.ts": component(`<p class="{{ open() }}">bad</p>`),
      "node_modules/x/index.ts": component(`<p class="{{ open() }}"></p>`),
      "dist/out.ts": component(`<p class="{{ open() }}"></p>`),
      "src/types.d.ts": `declare const x: number;`,
    });
    const checks = new CompileChecks(root);
    expect(checks.list().map((e) => e.file)).toEqual(["src/bad.ts"]);

    // unchanged: nothing to tell the shell
    expect(checks.update([join(root, "src/bad.ts"), "src/ok.ts", "README.md"])).toBe(false);
    // fixed: the error clears
    writeFileSync(join(root, "src/bad.ts"), component(`<p [attr.class]="open()">bad</p>`));
    expect(checks.update(["src/bad.ts"])).toBe(true);
    expect(checks.list()).toEqual([]);
    // broken again, then deleted
    writeFileSync(join(root, "src/ok.ts"), component(`<section><p>unclosed</section>`));
    expect(checks.update([join(root, "src/ok.ts")])).toBe(true);
    expect(checks.list().map((e) => [e.file, e.rule])).toEqual([["src/ok.ts", "template-syntax"]]);
    rmSync(join(root, "src/ok.ts"));
    expect(checks.update(["src/ok.ts"])).toBe(true);
    expect(checks.list()).toEqual([]);
  });
});

const entry = (seq: number, status: HmrEntry["status"], modules: string[], errors: string[] = []): HmrEntry => ({ seq, at: seq * 1000, status, modules, changes: [], errors });
const error = (file: string, line = 14): CompileError => ({ file, line, column: 22, rule: "template-syntax", message: 'Interpolation in attribute "class" is not supported; use [attr.class] or [class.name].' });

describe("stale canvas (shell)", () => {
  it("reads module URLs and paths as project paths", () => {
    expect(modulePath("http://localhost:5173/src/components/todo-app.ts?t=123")).toBe("src/components/todo-app.ts");
    expect(modulePath("/src/a%20b.ts")).toBe("src/a b.ts");
    expect(modulePath("C:\\work\\app\\src\\a.ts")).toBe("C:/work/app/src/a.ts");
  });

  it("tracks the latest hot update of each module: a later applied update clears a rollback", () => {
    const url = "http://localhost:5173/src/a.ts";
    expect(rolledBack([entry(1, "rolled-back", [url], ["boom"])])).toEqual([{ file: "src/a.ts", errors: ["boom"] }]);
    expect(rolledBack([entry(2, "applied", [url]), entry(1, "rolled-back", [url], ["boom"])])).toEqual([]);
    expect(rolledBack([entry(1, "rolled-back", [url], ["boom"]), entry(2, "unchanged", [url])])).toEqual([]);
  });

  it("says nothing while the canvas follows the source", () => {
    expect(staleCanvas([], [])).toBeNull();
    expect(staleCanvas([], [entry(1, "applied", ["http://localhost:1/src/a.ts"])])).toBeNull();
  });

  it("names the compile error, and says the canvas shows the last good version once the page refused the update", () => {
    const before = staleCanvas([error("src/a.ts")], []);
    expect(before).toMatchObject({ title: "Template does not compile", where: "src/a.ts:14:22", lastGood: false, more: 0, file: "src/a.ts" });
    expect(staleNote(before!)).toBe("The canvas changes once it compiles.");

    const after = staleCanvas([error("src/z.ts"), error("src/a.ts", 3)], [entry(4, "rolled-back", ["http://localhost:1/src/a.ts"], ["Interpolation…"])]);
    // the one the page refused comes first; the other file is counted
    expect(after).toMatchObject({ where: "src/a.ts:3:22", lastGood: true, more: 1 });
    expect(staleNote(after!)).toBe("The canvas shows the last good version until this is fixed. (1 more in Problems)");
  });

  it("falls back to the page's own report when the compile check has nothing against the file", () => {
    const s = staleCanvas([], [entry(1, "rolled-back", ["http://localhost:1/src/b.ts"], ["setup threw"])]);
    expect(s).toMatchObject({ title: "The hot update failed", where: "src/b.ts", message: "setup threw", lastGood: true, more: 0 });
  });

  it("tells whether a component's source file is the stale one", () => {
    const errors = [error("src/a.ts")];
    expect(isStale(errors, [], "/src/a.ts")).toBe(true);
    expect(isStale(errors, [], "http://localhost:1/src/a.ts?t=2")).toBe(true);
    expect(isStale(errors, [], "/src/b.ts")).toBe(false);
    expect(isStale([], [entry(1, "rolled-back", ["http://localhost:1/src/b.ts"])], "/src/b.ts")).toBe(true);
  });
});

describe("class list read-only (Style panel)", () => {
  const attr = (name: string, value: string, kind: "static" | "binding" = name.startsWith("[") ? "binding" : "static") => ({ name, value, kind });

  it("is writable as plain text, or with [class.x] toggles next to it", () => {
    expect(classListWritable([])).toBe(true);
    expect(classListWritable([attr("class", "text-2xl font-bold")])).toBe(true);
    expect(classListWritable([attr("class", "text-2xl"), attr("[class.opacity-50]", "open()")])).toBe(true);
  });

  it("is read-only when a binding sets the whole list", () => {
    expect(classListWritable([attr("class", "text-2xl"), attr("[attr.class]", "cls()")])).toBe(false);
    expect(classListWritable([attr("[className]", "cls()")])).toBe(false);
    expect(classListWritable([attr("[class]", "cls()")])).toBe(false);
  });

  it("lists bound classes as conditional", () => {
    expect(conditionalClasses([attr("class", "a"), attr("[class.on]", "open()"), attr("[attr.class]", "cls()")])).toEqual([
      { name: "on", attr: "[class.on]" },
      { name: "cls()", attr: "[attr.class]" },
    ]);
  });
});
