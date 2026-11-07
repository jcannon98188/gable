// Unified-diff parsing and a small line differ (Myers O(ND)) for `ui-code-block`. Pure, total (never throws) and
// dependency-free.

/** The role of one line of a parsed unified diff: `file` header, `hunk` header (`@@`), `add`, `del`, `context`, a `note` (such as the no-newline marker) or `meta` (anything else, like `index` lines). */
export type DiffKind = "file" | "hunk" | "add" | "del" | "context" | "note" | "meta";

/** One classified line of a unified diff, with its text, its text without the marker and its old and new line numbers when known. */
export interface DiffLine {
  kind: DiffKind;
  /** The line as written in the diff, without its `\n` (a `\r` stays). For `add`/`del`/`context` it starts with the marker. */
  text: string;
  /** `text` without the `+`, `-` or ` ` marker (the whole line for the other kinds). */
  content: string;
  /** Line number in the old file (`del`, `context`), when known. */
  oldNo: number | null;
  /** Line number in the new file (`add`, `context`), when known. */
  newNo: number | null;
}

const line = (kind: DiffKind, text: string, content: string, oldNo: number | null = null, newNo: number | null = null): DiffLine => ({ kind, text, content, oldNo, newNo });

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FILE_HEADER = /^(?:diff |index |--- |\+\+\+ |similarity index|dissimilarity index|rename (?:from|to) |copy (?:from|to) |new file mode|deleted file mode|old mode|new mode|Binary files |GIT binary patch)/;

/**
 * Parses unified diff text into classified lines. Total: anything that is not recognised is `meta`; hunk line numbers
 * come from the `@@` headers (and are `null` outside a hunk). One line per `\n`-separated line of the text, so
 * `serializeDiff(parseDiff(t)) === t` for every `t`.
 */
export function parseDiff(text: string): DiffLine[] {
  const src = String(text ?? "");
  const raw = src.split("\n");
  if (src.endsWith("\n")) raw.pop();
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  let remOld = 0;
  let remNew = 0;
  for (const text of raw) {
    const probe = text.endsWith("\r") ? text.slice(0, -1) : text;
    const inHunk = remOld > 0 || remNew > 0;
    const first = probe[0];
    if (first === "@" && probe.startsWith("@@")) {
      const m = HUNK.exec(probe);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[3]);
        remOld = m[2] === undefined ? 1 : Number(m[2]);
        remNew = m[4] === undefined ? 1 : Number(m[4]);
      } else {
        remOld = remNew = 0;
      }
      out.push(line("hunk", text, text));
    } else if (first === "\\") {
      out.push(line("note", text, text));
    } else if (inHunk && first === "+") {
      out.push(line("add", text, text.slice(1), null, newNo++));
      remNew--;
    } else if (inHunk && first === "-") {
      out.push(line("del", text, text.slice(1), oldNo++, null));
      remOld--;
    } else if (inHunk && (first === " " || probe === "")) {
      out.push(line("context", text, text.slice(1), oldNo++, newNo++));
      remOld--;
      remNew--;
    } else if (FILE_HEADER.test(probe)) {
      remOld = remNew = 0;
      out.push(line("file", text, text));
    } else if (first === "+") out.push(line("add", text, text.slice(1)));
    else if (first === "-") out.push(line("del", text, text.slice(1)));
    else if (first === " ") out.push(line("context", text, text.slice(1)));
    else out.push(line("meta", text, text));
    if (remOld < 0) remOld = 0;
    if (remNew < 0) remNew = 0;
  }
  return out;
}

/** The text of `lines` (one per line). Inverse of `parseDiff` up to a final newline. */
export const serializeDiff = (lines: readonly DiffLine[]): string => lines.map((l) => l.text).join("\n");

type Op = 0 | 1 | 2; // equal, delete (from a), add (from b)

/** Myers' shortest edit script between two arrays of lines; `null` when it needs more than `maxD` edits. */
function myers(a: readonly string[], b: readonly string[], maxD: number): Op[] | null {
  const n = a.length;
  const m = b.length;
  if (n + m === 0) return [];
  const limit = Math.min(n + m, maxD);
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= limit && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[k - 1 + off]! < v[k + 1 + off]!) ? v[k + 1 + off]! : v[k - 1 + off]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k + off] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    trace.push(v.slice());
  }
  if (found < 0) return null;
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d - 1]!;
    const k = x - y;
    const insert = k === -d || (k !== d && prev[k - 1 + off]! < prev[k + 1 + off]!);
    const prevK = insert ? k + 1 : k - 1;
    const prevX = prev[prevK + off]!;
    const prevY = prevX - prevK;
    const midX = insert ? prevX : prevX + 1;
    const midY = insert ? prevY + 1 : prevY;
    while (x > midX && y > midY) {
      ops.push(0);
      x--;
      y--;
    }
    ops.push(insert ? 2 : 1);
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push(0);
    x--;
    y--;
  }
  return ops.reverse();
}

const toLines = (s: string): string[] => {
  const t = String(s ?? "");
  if (t === "") return [];
  const parts = t.split("\n");
  if (t.endsWith("\n")) parts.pop();
  return parts;
};

/** Options for `diffLines`. */
export interface DiffOptions {
  /** Unchanged lines kept around each change (default 3). A negative number keeps everything and writes no `@@` headers. */
  context?: number;
  /** Give up on the exact edit script past this many edits and show the changed middle as one delete and one add. */
  maxEdits?: number;
}

/**
 * A line diff of `oldText` against `newText` as unified-diff lines (`@@ -a,b +c,d @@` headers, `+`/`-`/` ` lines, unchanged
 * stretches beyond `context` lines collapsed). Equal texts give `[]`.
 */
export function diffLines(oldText: string, newText: string, options: DiffOptions = {}): DiffLine[] {
  const a = toLines(oldText);
  const b = toLines(newText);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  const script = myers(midA, midB, options.maxEdits ?? 1000) ?? [...midA.map((): Op => 1), ...midB.map((): Op => 2)];

  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  for (let p = 0; p < prefix; p++, i++, j++) rows.push(line("context", ` ${a[i]}`, a[i]!, i + 1, j + 1));
  for (const op of script) {
    if (op === 0) {
      rows.push(line("context", ` ${midA[i - prefix]}`, midA[i - prefix]!, i + 1, j + 1));
      i++;
      j++;
    } else if (op === 1) {
      rows.push(line("del", `-${midA[i - prefix]}`, midA[i - prefix]!, i + 1, null));
      i++;
    } else {
      rows.push(line("add", `+${midB[j - prefix]}`, midB[j - prefix]!, null, j + 1));
      j++;
    }
  }
  for (let s = 0; s < suffix; s++, i++, j++) rows.push(line("context", ` ${a[i]}`, a[i]!, i + 1, j + 1));
  if (!rows.some((r) => r.kind !== "context")) return [];

  const context = options.context ?? 3;
  if (context < 0) return rows;
  const keep = new Uint8Array(rows.length);
  for (let r = 0; r < rows.length; r++) {
    if (rows[r]!.kind === "context") continue;
    for (let q = Math.max(0, r - context); q <= Math.min(rows.length - 1, r + context); q++) keep[q] = 1;
  }
  const oldPre = new Int32Array(rows.length + 1);
  const newPre = new Int32Array(rows.length + 1);
  for (let r = 0; r < rows.length; r++) {
    oldPre[r + 1] = oldPre[r]! + (rows[r]!.kind !== "add" ? 1 : 0);
    newPre[r + 1] = newPre[r]! + (rows[r]!.kind !== "del" ? 1 : 0);
  }
  const out: DiffLine[] = [];
  for (let r = 0; r < rows.length; ) {
    if (!keep[r]) {
      r++;
      continue;
    }
    let end = r;
    while (end < rows.length && keep[end]) end++;
    const group = rows.slice(r, end);
    const oldCount = group.filter((g) => g.kind !== "add").length;
    const newCount = group.filter((g) => g.kind !== "del").length;
    const oldBefore = oldPre[r]!;
    const newBefore = newPre[r]!;
    const header = `@@ -${oldCount === 0 ? oldBefore : oldBefore + 1},${oldCount} +${newCount === 0 ? newBefore : newBefore + 1},${newCount} @@`;
    out.push(line("hunk", header, header));
    out.push(...group);
    r = end;
  }
  return out;
}

/** One row of a side-by-side diff: either a full-width line (`full`) or a `left` (old) and `right` (new) pair; a missing side is null. */
export interface SplitRow {
  /** A full-width row (file header, hunk header, note, meta). */
  full: DiffLine | null;
  left: DiffLine | null;
  right: DiffLine | null;
}

/** Pairs a unified diff's lines for side-by-side display: a run of deletions sits next to the run of additions after it. */
export function splitRows(lines: readonly DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  for (let i = 0; i < lines.length; ) {
    const l = lines[i]!;
    if (l.kind === "context") {
      rows.push({ full: null, left: l, right: l });
      i++;
    } else if (l.kind === "del" || l.kind === "add") {
      const dels: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i]!.kind === "del") dels.push(lines[i++]!);
      while (i < lines.length && lines[i]!.kind === "add") adds.push(lines[i++]!);
      for (let r = 0; r < Math.max(dels.length, adds.length); r++) rows.push({ full: null, left: dels[r] ?? null, right: adds[r] ?? null });
    } else {
      rows.push({ full: l, left: null, right: null });
      i++;
    }
  }
  return rows;
}
