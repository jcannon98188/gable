// The unified diff of one write, for the drawer's Code tab: what the patch did to the file, line by line, as `git diff` would
// print it (`--- a/<file>`, `+++ b/<file>`, `@@ -a,b +c,d @@`, three lines of context). Computed from the text before and after
// the write, so it shows exactly what reached the disk. Line endings are compared without the `\r`.

export interface DiffLine {
  /** ` ` context, `-` removed, `+` added. */
  kind: " " | "-" | "+";
  text: string;
  /** Line number in the old file (context and removed lines). */
  old?: number;
  /** Line number in the new file (context and added lines). */
  new?: number;
}

export interface DiffHunkView {
  /** `@@ -a,b +c,d @@` */
  header: string;
  lines: DiffLine[];
}

export interface UnifiedDiff {
  /** Project-relative path. */
  file: string;
  added: number;
  removed: number;
  hunks: DiffHunkView[];
  /** The whole diff as text (headers included), as a patch tool reads it. */
  text: string;
}

const CONTEXT = 3;
/** Past this many differing lines the edit script is not searched for: the changed region is shown as one replacement. */
const MAX_EDIT = 4000;

type Op = { kind: " " | "-" | "+"; a: number; b: number };

const lines = (text: string): string[] => {
  if (text === "") return [];
  const all = text.replaceAll("\r\n", "\n").split("\n");
  // A final newline ends the last line; it does not start an empty one.
  if (all.length > 1 && all[all.length - 1] === "") all.pop();
  return all;
};

/** Myers' shortest edit script between `a` and `b` (indices into each), or null when it is longer than `max`. */
function myers(a: string[], b: string[], max: number): Op[] | null {
  const n = a.length;
  const m = b.length;
  const offset = max + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) (x++, y++);
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, offset, n, m, d);
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], offset: number, n: number, m: number, depth: number): Op[] {
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = depth; d > 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!);
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) ops.push({ kind: " ", a: --x, b: --y });
    if (down) ops.push({ kind: "+", a: x, b: --y });
    else ops.push({ kind: "-", a: --x, b: y });
  }
  while (x > 0 && y > 0) ops.push({ kind: " ", a: --x, b: --y });
  return ops.reverse();
}

/** The line edit script from `a` to `b`: common head and tail trimmed, Myers in between (one replacement when too long). */
function script(a: string[], b: string[]): Op[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const ops: Op[] = [];
  for (let i = 0; i < head; i++) ops.push({ kind: " ", a: i, b: i });
  const mid = myers(midA, midB, Math.min(MAX_EDIT, midA.length + midB.length)) ?? [
    ...midA.map((_, i) => ({ kind: "-" as const, a: i, b: 0 })),
    ...midB.map((_, i) => ({ kind: "+" as const, a: midA.length, b: i })),
  ];
  for (const op of mid) ops.push({ kind: op.kind, a: op.a + head, b: op.b + head });
  for (let i = tail; i > 0; i--) ops.push({ kind: " ", a: a.length - i, b: b.length - i });
  return ops;
}

const range = (start: number, count: number) => (count === 1 ? `${start}` : `${count === 0 ? start - 1 : start},${count}`);

/** The unified diff from `before` to `after`; no hunks when the texts have the same lines. */
export function unifiedDiff(file: string, before: string, after: string, context = CONTEXT): UnifiedDiff {
  const a = lines(before);
  const b = lines(after);
  const ops = script(a, b);
  const hunks: DiffHunkView[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === " ") {
      i++;
      continue;
    }
    // A hunk: the change at `i`, the context before it, and every later change no further than 2 x context away.
    const from = Math.max(0, i - context);
    let to = i;
    let gap = 0;
    for (let j = i; j < ops.length; j++) {
      if (ops[j]!.kind === " ") {
        if (++gap > 2 * context) break;
      } else {
        gap = 0;
        to = j;
      }
    }
    const end = Math.min(ops.length, to + 1 + context);
    const slice = ops.slice(from, end);
    const out: DiffLine[] = slice.map((op) => {
      if (op.kind === "+") return (added++, { kind: "+", text: b[op.b]!, new: op.b + 1 });
      if (op.kind === "-") return (removed++, { kind: "-", text: a[op.a]!, old: op.a + 1 });
      return { kind: " ", text: a[op.a]!, old: op.a + 1, new: op.b + 1 };
    });
    const oldCount = out.filter((l) => l.kind !== "+").length;
    const newCount = out.filter((l) => l.kind !== "-").length;
    const first = slice[0]!;
    const header = `@@ -${range(first.a + 1, oldCount)} +${range(first.b + 1, newCount)} @@`;
    hunks.push({ header, lines: out });
    i = end;
  }
  const text = hunks.length
    ? [`--- a/${file}`, `+++ b/${file}`, ...hunks.flatMap((h) => [h.header, ...h.lines.map((l) => l.kind + l.text)])].join("\n") + "\n"
    : "";
  return { file, added, removed, hunks, text };
}
