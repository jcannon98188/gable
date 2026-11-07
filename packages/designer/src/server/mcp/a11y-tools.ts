// The MCP tools behind the Accessibility and Focus & tree tabs (TASK-56.26): the checker's report, the page's keyboard focus
// order, its accessibility tree, stepping focus through it as Tab would, and the canvas view (the numbered focus order and
// keyboard-only mode). They go through the shell, so the window shows what the agent does; none of them writes to source.
import { z } from "zod";
import type { A11yReport, A11yTreeNode, A11yTreeReport, FocusEntry, FocusOrderReport, FocusStepResult } from "../../protocol.js";
import type { NetworkToolKit } from "./network-tools.js";

export type A11yToolKit = Pick<NetworkToolKit, "server" | "shell" | "read" | "write" | "guard">;

const where = (n: { tag: string; component: string | null } | null): string => (n ? `<${n.tag}>${n.component ? ` in ${n.component}` : ""}` : "not rendered by a template");

/** The accessibility tree as an indented outline, one node per line: `role "name" [states] (tab) !warnings`. */
export function outline(tree: readonly A11yTreeNode[], maxLines = 400): { lines: string[]; cut: number } {
  const lines: string[] = [];
  let total = 0;
  const walk = (nodes: readonly A11yTreeNode[], depth: number) => {
    for (const n of nodes) {
      total++;
      if (lines.length < maxLines) {
        const states = Object.entries(n.states)
          .filter(([k]) => k !== "description")
          .map(([k, v]) => (v === true ? k : v === false ? `not ${k}` : `${k}=${v}`));
        const parts = [n.role === "text" ? `text "${n.name}"` : n.name ? `${n.role} "${n.name}"` : n.role];
        if (states.length) parts.push(`[${states.join(", ")}]`);
        if (n.focusable) parts.push("(tab)");
        if (n.warnings.length) parts.push(`!${n.warnings.join("; ")}`);
        lines.push(`${"  ".repeat(depth)}${parts.join(" ")}`);
      }
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return { lines, cut: Math.max(0, total - lines.length) };
}

/** A focus order as an agent reads it: one line per Tab stop, and the things that need a person's attention. */
export function focusView(r: FocusOrderReport) {
  const stop = (s: FocusEntry) => `${s.index}. ${s.role} ${s.name ? `"${s.name}"` : "(no name)"}${s.tabindex !== null ? ` tabindex=${s.tabindex}` : ""} ${where(s.node)}${s.warnings.length ? ` !${s.warnings.join(", ")}` : ""}${s.focused ? " <- focus" : ""}`;
  return {
    url: r.url,
    mode: r.mode,
    stops: r.stops.length,
    order: r.stops.map(stop),
    problems: r.stops.filter((s) => s.warnings.length).map((s) => ({ stop: s.index, role: s.role, name: s.name, warnings: s.warnings, at: where(s.node) })),
    unreachable: r.unreachable.map((u) => ({ role: u.role, name: u.name, reason: u.reason, at: where(u.node) })),
    scriptOnly: r.scripted.map((u) => ({ role: u.role, name: u.name, tabindex: u.tabindex, at: where(u.node) })),
    focus: r.activeElement ? { tag: r.activeElement.tag, name: r.activeElement.name, stop: r.focused, at: where(r.activeElement.node) } : null,
    notes: r.notes,
  };
}

export function treeView(r: A11yTreeReport, maxLines: number) {
  const o = outline(r.tree, maxLines);
  return {
    url: r.url,
    mode: r.mode,
    from: r.root ? `<${r.root.tag}> (selected element)` : "the whole page",
    nodes: r.nodes,
    unnamedControls: r.unnamed,
    headingLevelSkips: r.headingSkips,
    ...(r.truncated ? { truncated: `The page has more than ${r.nodes} nodes; the rest are not listed.` } : {}),
    tree: o.lines,
    ...(o.cut ? { linesCut: o.cut, note: `${o.cut} more lines; pass fromSelection with a selected element, or a larger maxLines.` } : {}),
    notes: r.notes,
  };
}

export function stepView(r: FocusStepResult) {
  return {
    stopsOnPage: r.stops,
    visited: r.visited.map((v) => `${v.index}. ${v.role} ${v.name ? `"${v.name}"` : "(no name)"} ${where(v.node)}${v.indicator ? "" : " !no visible focus indicator"}`),
    withoutFocusIndicator: r.visited.filter((v) => !v.indicator).length,
    trapped: r.trapped,
    wrapped: r.wrapped,
    note: r.note,
  };
}

/** The checker's report, shortened for an agent: failures first, each with its element's template node. */
export function checksView(r: A11yReport, max: number) {
  const checks = r.checks.slice(0, max).map((c) => ({ rule: c.rule, kind: c.kind, impact: c.impact, help: c.help, summary: c.summary, html: c.html, at: where(c.node) }));
  return {
    engine: r.engine,
    url: r.url,
    mode: r.mode,
    rulesRun: r.rules,
    rulesPassed: r.passed,
    violations: r.checks.filter((c) => c.kind === "violation").length,
    toReview: r.checks.filter((c) => c.kind === "review").length,
    checks,
    ...(r.checks.length > max ? { cut: r.checks.length - max } : {}),
    note: "Automated checks find only part of the problems; keyboard and screen reader use still need a person.",
  };
}

export function registerA11yTools({ server, shell, read, write, guard }: A11yToolKit): void {
  server.registerTool(
    "get_accessibility",
    {
      ...read("Get accessibility checks", "The Accessibility tab's findings for the selected frame: the axe-core checker run on the page as rendered (real layout and colours), each failing element with its rule, impact, explanation and the template node that renders it. Checks the checker could not decide are `review`, never passed."),
      inputSchema: { rerun: z.boolean().default(false).describe("Run the checker again now; otherwise the last report (run if there is none)."), max: z.number().int().min(1).max(500).default(100) },
    },
    guard(async ({ rerun, max }) => {
      const r = await shell("a11y", { action: "report", rerun }, 60000);
      return r.report ? { frame: r.frame, ...checksView(r.report, max) } : { frame: r.frame, error: r.error ?? "No report: the checker is already running; try again." };
    }),
  );

  server.registerTool(
    "get_focus_order",
    read("Get focus order", "The selected frame's keyboard focus order as Tab visits it: every stop with its role and accessible name, tabindex, the template node that renders it, and what is wrong: a positive tabindex, no name, focusable inside aria-hidden, a jump back up the page. Also controls the keyboard cannot reach (a control role or click handler on a non-focusable element) and elements focusable by script only (tabindex=-1). Computed from the rendered page; shadow DOM is not followed."),
    guard(async () => {
      const r = await shell("a11y", { action: "focusOrder" });
      return { frame: r.frame, ...focusView(r.focus!) };
    }),
  );

  server.registerTool(
    "get_a11y_tree",
    {
      ...read("Get accessibility tree", "The selected frame's accessibility tree as an outline: each node's role, accessible name and states (level, checked, expanded, disabled, ...), whether it is a Tab stop, and warnings (a control or image with no name, an empty heading, a heading level skip). Generic wrappers are left out. Computed from the DOM (roles per HTML-AAM, names per accname), so close to, not identical with, a browser's own tree."),
      inputSchema: {
        fromSelection: z.boolean().default(false).describe("Start at the element selected in the Designer instead of the whole page."),
        maxLines: z.number().int().min(10).max(2500).default(400),
      },
    },
    guard(async ({ fromSelection, maxLines }) => {
      let id: string | undefined;
      if (fromSelection) {
        const sel = (await shell("snapshot", undefined)).selection;
        if (!sel) throw new Error("Nothing is selected: select an element first, or omit fromSelection.");
        id = sel.node.id;
      }
      const r = await shell("a11y", { action: "tree", ...(id ? { id } : {}) });
      return { frame: r.frame, ...treeView(r.tree!, maxLines) };
    }),
  );

  server.registerTool(
    "step_focus",
    {
      ...write("Step keyboard focus", "Moves keyboard focus through the selected frame as Tab would (next or previous stop, wrapping at the ends; first or last), `steps` times, and reports each stop visited: its role and name, and whether it shows a visible focus indicator (an outline, or a change of shadow, border, background or underline when focused). Reports a focus trap when focus will not move or cycles without reaching the rest. Moves the page's real focus, which can run the page's own focus and blur handlers; it presses nothing."),
      inputSchema: { to: z.enum(["next", "prev", "first", "last"]).default("next"), steps: z.number().int().min(1).max(200).default(1).describe("How many stops to move; 50 or more checks a whole page for traps and missing focus indicators.") },
    },
    guard(async ({ to, steps }) => {
      const r = await shell("a11y", { action: "step", to, steps });
      return { frame: r.frame, ...stepView(r.step!) };
    }),
  );

  server.registerTool(
    "set_a11y_view",
    {
      ...write("Set accessibility view", "Turns the canvas's accessibility view on or off in the selected frame: `focusOrder` draws the numbered Tab order over the page (amber where it has a problem), `keyboardOnly` makes the page ignore the mouse in Interact mode so it can only be operated by keyboard, and the focused element is outlined. Lasts until the frame reloads or it is turned off here or in the Focus & tree tab; both show in screenshots.", true),
      inputSchema: { focusOrder: z.boolean().optional(), keyboardOnly: z.boolean().optional() },
    },
    guard(async ({ focusOrder, keyboardOnly }) => {
      const r = await shell("a11y", { action: "view", ...(focusOrder !== undefined ? { focusOrder } : {}), ...(keyboardOnly !== undefined ? { keyboardOnly } : {}) });
      return { frame: r.frame, view: r.view };
    }),
  );
}
