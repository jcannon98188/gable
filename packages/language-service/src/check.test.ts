import { cpSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "./cli.js";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

interface Reported {
  file: string;
  line: number;
  column: number;
  rule: string;
  severity: "warn" | "error";
  message: string;
}

/** Runs gable-check on a fixture project and captures its output. */
const runs = new Map<string, ReturnType<typeof run>>();
const check = (name: string) => runs.get(name) ?? (runs.set(name, run(name)), runs.get(name)!);

async function run(name: string, extra: string[] = []) {
  let out = "";
  let err = "";
  const code = await main(["--project", fixture(name), "--format", "json", ...extra], {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
  });
  return { code, diagnostics: out ? (JSON.parse(out) as Reported[]) : [], err };
}

/** 1-based line and column of the first occurrence of `snippet` (plus `into` characters) in a fixture source. */
function where(name: string, snippet: string, into = 0) {
  const text = readFileSync(`${fixture(name)}/src/app.ts`, "utf8");
  const at = text.indexOf(snippet);
  expect(at, `${snippet} in fixture`).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, at + into).split("\n");
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
}

describe("gable-check", () => {
  it("passes a project whose templates are all valid", async () => {
    const { code, diagnostics } = await check("pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  describe("a bad template fails with diagnostics mapped to template positions", () => {
    const expectations: Array<[rule: string, snippet: string, into: number]> = [
      ["bare-signal", "{{ count }}", 3],
      ["unknown-member", "cuont()", 0],
      ["call-non-signal", "format()", 0],
      ["call-observable", "user$()", 0],
      ["expression-syntax", "count() + 1", 0],
      ["expression-syntax", "describe(1)", 0],
      ["expression-syntax", "count() == 1", 0],
      ["type-mismatch", "count() === \"one\"", 0],
      ["unknown-member", "user$.nam", 6],
      ["type-mismatch", "count(); track n", 0],
      ["model-not-writable", "readonlyName", 0],
      ["unknown-member", "missing()", 0],
    ];

    it("exits non-zero and reports every bad expression, and only those", async () => {
      const { code, diagnostics } = await check("fail");
      expect(code).toBe(1);
      expect(diagnostics).toHaveLength(expectations.length);
    });

    it.each(expectations)("%s at %s", async (rule, snippet, into) => {
      const { diagnostics } = await check("fail");
      const at = where("fail", snippet, into);
      const hit = diagnostics.find((d) => d.rule === rule && d.line === at.line && d.column === at.column);
      expect(hit, JSON.stringify(diagnostics, null, 1)).toBeDefined();
      expect(hit!.severity).toBe("error");
      expect(hit!.file).toMatch(/src[\/]app\.ts$/);
    });

    it("says how to fix a bare signal", async () => {
      const { diagnostics } = await check("fail");
      expect(diagnostics.find((d) => d.rule === "bare-signal")!.message).toMatch(/call it: count\(\)/);
    });

    it("prints a readable line per diagnostic in text format", async () => {
      let out = "";
      await main(["--project", fixture("fail")], { stdout: (s) => (out += s), stderr: () => {} });
      const at = where("fail", "{{ count }}", 3);
      expect(out).toContain(`app.ts:${at.line}:${at.column} error gable/bare-signal`);
    });
  });

  describe("per-rule severity from the tsconfig plugin config", () => {
    it("downgrades a rule to warn: reported, exit code 0, other rules stay errors", async () => {
      const { code, diagnostics } = await check("severity-warn");
      expect(diagnostics.map((d) => [d.rule, d.severity])).toEqual([
        ["bare-signal", "warn"],
        ["unknown-member", "error"],
      ]);
      expect(code).toBe(1);
    });

    it("exits 0 when only warnings remain", async () => {
      const { code, diagnostics } = await check("warn-only");
      expect(diagnostics.map((d) => [d.rule, d.severity])).toEqual([["bare-signal", "warn"]]);
      expect(code).toBe(0);
    });

    it("turns a rule off", async () => {
      const { diagnostics } = await check("severity-off");
      expect(diagnostics.map((d) => d.rule)).toEqual(["unknown-member"]);
    });

    it("rejects unknown rule names and severities as a config error", async () => {
      const { code, err, diagnostics } = await check("config-error");
      expect(code).toBe(2);
      expect(diagnostics).toEqual([]);
      expect(err).toMatch(/no-such-rule/);
      expect(err).toMatch(/loud/);
    });
  });

  describe("event and two-way rules", () => {
    it("passes typed events, outputs, native models and component models", async () => {
      const { code, diagnostics } = await check("events-pass");
      expect(diagnostics).toEqual([]);
      expect(code).toBe(0);
    });

    const expectations: Array<[rule: string, snippet: string, into: number]> = [
      ["unknown-event", "(clck)", 1],
      ["type-mismatch", "onKey($event)", 6],
      ["unknown-event", "(pickd)", 1],
      ["type-mismatch", "onText($event)", 7],
      ["model-type-mismatch", '[(value)]="num" />', 11],
      ["model-type-mismatch", '"num"></x-child>', 1],
      ["type-mismatch", "$event.currentTarget.checked", 0],
    ];

    it("reports exactly the bad bindings", async () => {
      const { code, diagnostics } = await check("events-fail");
      expect(code).toBe(1);
      expect(diagnostics).toHaveLength(expectations.length);
    });

    it.each(expectations)("%s at %s", async (rule, snippet, into) => {
      const { diagnostics } = await check("events-fail");
      const at = where("events-fail", snippet, into);
      expect(diagnostics.find((d) => d.rule === rule && d.line === at.line && d.column === at.column), JSON.stringify(diagnostics, null, 1)).toBeDefined();
    });

    it("suggests the closest name for an unknown event", async () => {
      const { diagnostics } = await check("events-fail");
      const messages = diagnostics.filter((d) => d.rule === "unknown-event").map((d) => d.message);
      expect(messages[0]).toMatch(/Did you mean "click"\?/);
      expect(messages[1]).toMatch(/Did you mean "picked"\?/);
    });
  });

  describe.each([
    [
      "scope typing for loops, lets, aliases and refs",
      "scope",
      [
        ["unknown-member", "row.nam", 4],
        ["unknown-member", "{{ $index }}</p>\n      }\n      <p>{{ row", 3],
        ["unknown-member", "{{ row.id }}", 3],
        ["unknown-member", "{{ later }}", 3],
        ["unknown-member", "{{ m }}", 3],
        ["type-mismatch", "focus(pane)", 6],
      ],
    ],
    [
      "Observable and Promise typing as value or undefined",
      "observed",
      [
        ["unknown-member", "user$.nam", 6],
        ["unknown-member", "later.vlue", 6],
        ["call-observable", "user$()", 0],
        ["call-observable", "later()", 0],
        ["model-not-writable", '"user$"', 1],
        ["type-mismatch", "take(user$.name)", 5],
      ],
    ],
  ] as const)("%s", (_title, prefix, expectations) => {
    it("passes a project that uses them correctly", async () => {
      const { code, diagnostics } = await check(`${prefix}-pass`);
      expect(diagnostics).toEqual([]);
      expect(code).toBe(0);
    });

    it("reports exactly the bad expressions", async () => {
      const { code, diagnostics } = await check(`${prefix}-fail`);
      expect(code).toBe(1);
      expect(diagnostics).toHaveLength(expectations.length);
    });

    it.each(expectations as unknown as Array<[string, string, number | undefined]>)("%s at %j", async (rule, snippet, into) => {
      const { diagnostics } = await check(`${prefix}-fail`);
      const at = where(`${prefix}-fail`, snippet, into);
      expect(diagnostics.find((d) => d.rule === rule && d.line === at.line && d.column === at.column), JSON.stringify(diagnostics, null, 1)).toBeDefined();
    });
  });

  it("suggests the nearest member for a misspelled name", async () => {
    const { diagnostics } = await check("scope-fail");
    expect(diagnostics.find((d) => d.message.includes("'nam'"))!.message).toMatch(/Did you mean 'name'\?/);
  });

  describe("quick fixes", () => {
    interface Fixed extends Reported {
      fixes?: Array<{ title: string; edits: Array<{ start: number; length: number; newText: string }> }>;
    }

    it("offers a fix on every extractable diagnostic, and none where the loop item is not an object", async () => {
      const { diagnostics } = await check("fixes");
      const withFix = (diagnostics as Fixed[]).filter((d) => d.fixes?.length);
      expect(withFix.map((d) => d.rule)).toEqual([
        "bare-signal",
        "expression-syntax",
        "expression-syntax",
        "call-non-signal",
        "expression-syntax",
        "expression-syntax",
        "expression-syntax",
        "expression-syntax",
      ]);
      const numeric = where("fixes", "{{ n + 1 }}", 3);
      const unfixable = (diagnostics as Fixed[]).filter((d) => !d.fixes?.length);
      expect(unfixable.map((d) => [d.line, d.column])).toEqual([[numeric.line, numeric.column]]);
    });

    describe("applied with --fix to a copy of the project", () => {
      // Unique per test process, so two runs (or a leftover from a killed one) never share the directory.
      const copy = fixture(`_fix-run-${process.pid}`);
      let fixedSource = "";
      let after: Reported[] = [];

      beforeAll(async () => {
        rmSync(copy, { recursive: true, force: true });
        cpSync(fixture("fixes"), copy, { recursive: true });
        await main(["--project", copy, "--fix", "--format", "json"], { stdout: (s) => (after = JSON.parse(s)), stderr: () => {} });
        fixedSource = readFileSync(`${copy}/src/app.ts`, "utf8");
        // Type-checking the whole project takes seconds, and vitest's default hook timeout is 10s; under a full run it needs more.
      }, 60_000);
      afterAll(() => rmSync(copy, { recursive: true, force: true }));

      it("leaves only the diagnostic that has no fix", () => {
        expect(after.map((d) => d.rule)).toEqual(["expression-syntax"]);
      });

      it("extracts computed view-model signals onto the component and rewrites the template", () => {
        expect(fixedSource).toContain("<p>{{ count() }}</p>");
        expect(fixedSource).toContain("readonly countText = computed(() => this.count() + 1);");
        expect(fixedSource).toContain("<p>{{ countText() }}</p>");
        expect(fixedSource).toContain("readonly labelText = computed(() => this.label(this.count()));");
        expect(fixedSource).toContain("readonly shoutText = computed(() => this.shout());");
        expect(fixedSource).toContain('import { html, signal, computed } from "@gable/core";');
      });

      it("names an extracted signal after the binding it feeds", () => {
        expect(fixedSource).toContain("readonly ariaExpanded = computed(() => this.count() ? 'true' : 'false');");
        expect(fixedSource).toContain('[attr.aria-expanded]="ariaExpanded()"');
      });

      it("turns an Observable into a signal for the derived value", () => {
        expect(fixedSource).toContain("readonly user = toSignal(this.user$);");
        expect(fixedSource).toContain(`readonly userText = computed(() => this.user()?.name + '!');`);
        expect(fixedSource).toContain('import { toSignal } from "@gable/core/rxjs";');
      });

      it("extracts a rows view model for a loop over a plain signal read", () => {
        expect(fixedSource).toMatch(/readonly todosRows = computed\(\(\) => this\.todos\(\)\.map\(\(todo\) => \(\{ \.\.\.todo, todoView: /);
        expect(fixedSource).toContain("@for (todo of todosRowsRows(); track todo.id)");
      });

      it("produces code that type-checks", () => {
        const parsed = ts.getParsedCommandLineOfConfigFile(`${copy}/tsconfig.json`, undefined, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
        const program = ts.createProgram(parsed.fileNames, parsed.options);
        const errors = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
        expect(errors).toEqual([]);
      });
    });
  });
});
