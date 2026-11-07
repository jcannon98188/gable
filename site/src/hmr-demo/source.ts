// The editable source of the live HMR demo and the one-click edits that patch it. The source is plain JavaScript (the
// page has no TypeScript compiler): a class with `static meta`, an `html` template and a few fields, exactly what a
// real component file holds. Lines are joined so the backticks of the template need no escaping here.

export const INITIAL_SOURCE = [
  "class Counter {",
  "  static meta = {",
  '    selector: "demo-counter",',
  "    template: html`",
  '      <p class="dc-n">Count: {{ count() }}</p>',
  '      <p class="dc-d">Doubled: {{ doubled() }}</p>',
  '      <button type="button" class="btn btn-a" (click)="increment()">+1</button>',
  '      <label class="dc-l">Your name <input class="dc-in" [value]="name()" (input)="rename($event)" /></label>',
  "      <p class=\"dc-h\">Hello, {{ name() || 'stranger' }}</p>",
  "    `,",
  "  };",
  "",
  "  count = signal(0);",
  "  doubled = computed(() => this.count() * 2);",
  '  name = signal("");',
  "",
  "  increment() {",
  "    this.count.update((n) => n + 1);",
  "  }",
  "",
  "  rename(event) {",
  "    this.name.set(event.target.value);",
  "  }",
  "}",
].join("\n");

/** One suggested edit: a label, what it demonstrates, and a function that patches the source text. */
export interface DemoEdit {
  id: string;
  label: string;
  /** What to expect, shown under the buttons while the edit is the last one applied. */
  hint: string;
  /** True for edits that are meant to fail, to show the rollback. */
  breaks?: boolean;
  /** Returns the patched source, or null when the text it patches is no longer there (the visitor edited it away). */
  apply(source: string): string | null;
}

const swap = (source: string, from: string, to: string): string | null => (source.includes(from) ? source.replace(from, to) : null);
const chain = (source: string, steps: Array<[string, string]>): string | null => {
  let out: string | null = source;
  for (const [from, to] of steps) {
    out = out === null ? null : swap(out, from, to);
  }
  return out;
};

export const EDITS: DemoEdit[] = [
  {
    id: "button",
    label: "Change the button text",
    hint: "A template edit: the view is rebuilt on the same instance, so every field keeps its value.",
    apply: (s) => swap(s, ">+1</button>", ">Add one</button>"),
  },
  {
    id: "triple",
    label: "Make doubled triple",
    hint: "A field initialiser changed: the class is set up again, then count and name are copied across by name and kind.",
    apply: (s) => chain(s, [["this.count() * 2", "this.count() * 3"], ["Doubled:", "Tripled:"]]),
  },
  {
    id: "label",
    label: "Add a label field and show it",
    hint: "A new field has no old value to take, so it starts from its initialiser.",
    apply: (s) =>
      chain(s, [
        ["Count: {{ count() }}", "{{ label() }}: {{ count() }}"],
        ["  count = signal(0);", '  label = signal("Clicks");\n  count = signal(0);'],
      ]),
  },
  {
    id: "remove",
    label: "Remove the doubled field",
    hint: "A removed field has nowhere to go, so it is dropped. The other fields still carry over.",
    apply: (s) => {
      const next = s.replace(/^ *<p class="dc-d">.*\n/m, "").replace(/^ *doubled = computed\(.*\n/m, "");
      return next === s ? null : next;
    },
  },
  {
    id: "syntax",
    label: "Break it: syntax error",
    breaks: true,
    hint: "The new module does not even evaluate. Nothing is applied and the running component is untouched.",
    apply: (s) => swap(s, '  name = signal("");', "  name = signal(;"),
  },
  {
    id: "throws",
    label: "Break it: throwing field",
    breaks: true,
    hint: "The new class evaluates but its setup throws. Gable builds it beside the old one, sees the failure and rolls back.",
    apply: (s) => swap(s, '  name = signal("");', '  name = signal("");\n  boom = (() => { throw new Error("boom: this field cannot be set up"); })();'),
  },
];

export interface DiffLine {
  kind: "add" | "del" | "same";
  text: string;
}

/** A small line diff (longest common subsequence), enough to show what an edit changed. Only changed lines plus one line of context are returned. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const all: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) all.push({ kind: "same", text: a[i++]! }), j++;
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) all.push({ kind: "del", text: a[i++]! });
    else all.push({ kind: "add", text: b[j++]! });
  }
  while (i < n) all.push({ kind: "del", text: a[i++]! });
  while (j < m) all.push({ kind: "add", text: b[j++]! });
  return all.filter((line, k) => line.kind !== "same" || all[k - 1]?.kind === "add" || all[k - 1]?.kind === "del" || all[k + 1]?.kind === "add" || all[k + 1]?.kind === "del");
}
