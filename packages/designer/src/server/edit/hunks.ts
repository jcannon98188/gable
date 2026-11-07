// Text patches and their reverses. A Hunk replaces `[start, end)` of a text; a PatchHunk is a hunk remembered together with
// what it replaced and the text around it, so it can be applied again (undo, redo) to a file that was edited in the meantime:
// it is found by its context when it is no longer where it was, and refused when its place cannot be found.
import { createHash } from "node:crypto";

export interface Hunk {
  start: number;
  end: number;
  text: string;
}

/** Where a change applies: `old` was at `start` (in the text the change is applied to), with `before` and `after` around it. */
export interface PatchHunk {
  start: number;
  old: string;
  new: string;
  before: string;
  after: string;
}

const CONTEXT = 48;

export const hash = (text: string): string => createHash("sha1").update(text).digest("hex");

/** Sorts hunks, refuses overlaps, applies. Hunks at the same offset keep their order. */
export function applyHunks(text: string, hunks: Hunk[]): string {
  const sorted = ordered(hunks);
  let out = "";
  let at = 0;
  for (const h of sorted) {
    out += text.slice(at, h.start) + h.text;
    at = h.end;
  }
  return out + text.slice(at);
}

function ordered(hunks: Hunk[]): Hunk[] {
  const sorted = hunks.map((h, i) => ({ h, i })).sort((a, b) => a.h.start - b.h.start || a.h.end - b.h.end || a.i - b.i).map((x) => x.h);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start < sorted[i - 1]!.end) throw new Error("Overlapping edits.");
  }
  return sorted;
}

/** Applies hunks and returns the new text with the patch that reverses exactly this change (coordinates of the new text). */
export function applyWithReverse(text: string, hunks: Hunk[]): { text: string; reverse: PatchHunk[] } {
  const sorted = ordered(hunks);
  const next = applyHunks(text, sorted);
  let delta = 0;
  const reverse: PatchHunk[] = [];
  for (const h of sorted) {
    const start = h.start + delta;
    reverse.push({
      start,
      old: h.text,
      new: text.slice(h.start, h.end),
      before: next.slice(Math.max(0, start - CONTEXT), start),
      after: next.slice(start + h.text.length, start + h.text.length + CONTEXT),
    });
    delta += h.text.length - (h.end - h.start);
  }
  return { text: next, reverse };
}

export type Located = { ok: true; hunks: Hunk[]; relocated: boolean } | { ok: false; error: string };

const occurrences = (text: string, needle: string): number[] => {
  const found: number[] = [];
  if (needle === "") return found;
  for (let i = text.indexOf(needle); i !== -1 && found.length < 2; i = text.indexOf(needle, i + 1)) found.push(i);
  return found;
};

/** Finds where each hunk of a patch applies in `current`: where it was if the text still matches, else by context. */
export function locate(current: string, patch: PatchHunk[]): Located {
  const hunks: Hunk[] = [];
  let relocated = false;
  for (const p of patch) {
    const at = (start: number) => current.startsWith(p.old, start);
    const ctxBefore = (start: number) => current.slice(Math.max(0, start - p.before.length), start) === p.before;
    const ctxAfter = (start: number) => current.slice(start + p.old.length, start + p.old.length + p.after.length) === p.after;
    let start = -1;
    if (at(p.start) && ctxBefore(p.start) && ctxAfter(p.start)) start = p.start;
    if (start < 0) {
      const hits = occurrences(current, p.before + p.old + p.after);
      if (hits.length === 1) start = hits[0]! + p.before.length;
    }
    if (start < 0 && p.old !== "" && at(p.start) && (ctxBefore(p.start) || ctxAfter(p.start))) start = p.start;
    if (start < 0 && p.old !== "") {
      const b = occurrences(current, p.before + p.old);
      if (b.length === 1) start = b[0]! + p.before.length;
      else if (b.length === 0) {
        const a = occurrences(current, p.old + p.after);
        if (a.length === 1) start = a[0]!;
      }
    }
    if (start < 0) {
      return { ok: false, error: `The text this change touched was edited since (near offset ${p.start}), so it can no longer be found.` };
    }
    if (start !== p.start) relocated = true;
    hunks.push({ start, end: start + p.old.length, text: p.new });
  }
  try {
    ordered(hunks);
  } catch {
    return { ok: false, error: "The change cannot be applied cleanly any more." };
  }
  return { ok: true, hunks, relocated };
}

/** Shortest single replacement that turns `a` into `b`, or null when they are equal. */
export function diffHunk(a: string, b: string): Hunk | null {
  if (a === b) return null;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { start: p, end: a.length - s, text: b.slice(p, b.length - s) };
}
