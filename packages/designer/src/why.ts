// Shared by the shell's "Why did this update" tab (TASK-56.19) and the MCP tools: turns the devtools hook's `why` report into
// the words and rows both show. The facts are the hook's (the signal writes behind each effect run, the dependency tree);
// nothing here adds to them.
import type { WhyCause, WhyDependency, WhyNode, WhyRun } from "@gable/core/devtools";
import type { WhyElementReport } from "./protocol.js";

/** `qty 2 → 3`, `qty 2 → 3 via total, big`; `by the Designer` when a tool made the write. */
export function causeText(c: WhyCause): string {
  const owner = c.signal.owner ? `${c.signal.owner}.` : "";
  const via = c.via.length ? ` via ${c.via.map((v) => v.name).join(", ")}` : "";
  return `${owner}${c.signal.name} ${c.before.s} → ${c.after.s}${via}${c.by === "designer" ? " (written by the Designer)" : ""}`;
}

/** What one run of an effect was caused by, in a sentence. */
export function runText(r: WhyRun): string {
  if (r.first) return "Created: its first run, so there is no earlier state to change from.";
  if (!r.causes.length) return "Ran again, but no recorded signal write explains it (a hot update, travel back in time, or a write the Designer did not see).";
  const more = r.more ? ` and ${r.more} more` : "";
  return `Caused by ${r.causes.map(causeText).join("; ")}${more}.`;
}

/** The binding as a person reads it: `text of <p>`, `class "done" of <li>`, or the effect's name when it is no template binding. */
export function bindingTitle(n: WhyNode): string {
  const b = n.binding;
  if (!b) return n.name;
  const [kind, name] = b.what.split(/:(.*)/s);
  const what = kind === "text" ? "text" : kind === "class" ? `class "${name}"` : kind === "style" ? `style "${name}"` : kind === "attr" ? `attribute "${name}"` : kind === "prop" ? `property "${name}"` : kind === "model" ? `model "${name}"` : kind === "input" ? `input "${name}"` : b.what;
  return `${what} of ${b.node}`;
}

export interface DependencyRow {
  key: string;
  depth: number;
  id: string;
  name: string;
  kind: string;
  owner: string | null;
  value: string;
  /** Already shown above, or left out by the depth bound. */
  note: string;
}

/** The dependency tree as indented rows, depth first. */
export function dependencyRows(deps: WhyDependency[], prefix = "", depth = 0): DependencyRow[] {
  const out: DependencyRow[] = [];
  deps.forEach((d, i) => {
    const key = `${prefix}${i}.${d.id}`;
    out.push({ key, depth, id: d.id, name: d.name, kind: d.kind, owner: d.owner, value: d.value.s, note: d.again ? "shown above" : d.cut ? "more not shown" : "" });
    out.push(...dependencyRows(d.depends, `${key}/`, depth + 1));
  });
  return out;
}

/** An agent-friendly summary of a report: for each binding, what it reads and why it last ran. */
export function summarizeWhy(report: Pick<WhyElementReport, "nodes">, runs = 3) {
  return report.nodes.map((n) => ({
    id: n.id,
    what: bindingTitle(n),
    kind: n.kind,
    component: n.owner?.name ?? null,
    runs: n.runs,
    dependsOn: dependencyRows(n.dependencies).map((r) => ({ depth: r.depth, signal: r.id, name: r.name, kind: r.kind, value: r.value, ...(r.note ? { note: r.note } : {}) })),
    dependents: n.dependents.map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
    ...(n.lastWrite ? { lastWrite: { step: n.lastWrite.seq, source: n.lastWrite.source, before: n.lastWrite.before.s, after: n.lastWrite.after.s } } : {}),
    recent: n.recent.slice(-runs).map((r) => ({
      atMs: Math.round(r.at),
      ms: r.ms,
      first: r.first,
      causes: r.causes.map((c) => ({ signal: c.signal.id, name: c.signal.name, owner: c.signal.owner, before: c.before.s, after: c.after.s, via: c.via.map((v) => v.name), by: c.by })),
      ...(r.more ? { moreCauses: r.more } : {}),
      explanation: runText(r),
    })),
  }));
}

/** What the Why tab shows (and the MCP tool reports): the selected element's bindings, or all of its component's effects. */
export interface WhyShown {
  scope: "element" | "component";
  /** `<li>` or `TodoItem`. */
  title: string;
  /** The component that owns the selected element, or the one shown. */
  component: { id: string; name: string } | null;
  /** The effects: one per dynamic binding of the element, or every effect of the component. */
  nodes: WhyNode[];
  /** Element scope: effects of the same component that update other elements. Component scope: effects left out of `nodes`. */
  elsewhere: number;
}
