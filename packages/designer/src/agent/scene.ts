// A canvas boundary's scene as a DOM-like tree for the Designer (canvas/139). Pure: it reads the devtools hook's boundary
// trees and shapes them for the shell; the agent supplies the hook.
import type { BoundaryNode, BoundaryTree, PageRect, SourceInfo } from "@gablejs/core/devtools";

/** One display object, nested like an element: its owning component, where that is defined, where the node sits in its template, and its box on the page. */
export interface SceneReportNode {
  id: string;
  name: string;
  kind: string;
  component: string | null;
  source: SourceInfo | null;
  /** The designer template node id and position; pass `id` to `selectNode` to select it like a clicked element. */
  template: { id: string; line: number; column: number } | null;
  rect: PageRect | null;
  /** Effects (template bindings) that ran on this node in the last flush. */
  effects: number;
  children: SceneReportNode[];
}

export interface SceneReport {
  id: string;
  label: string;
  kind: string;
  /** The nodes in the scene. */
  count: number;
  root: SceneReportNode | null;
  error?: string;
}

function nest(nodes: BoundaryNode[]): SceneReportNode | null {
  const byId = new Map<string, SceneReportNode>();
  let root: SceneReportNode | null = null;
  for (const n of nodes) {
    const out: SceneReportNode = {
      id: n.id,
      name: n.name,
      kind: n.kind,
      component: n.component?.name ?? null,
      source: n.source,
      template: n.template ? { id: n.template.id, line: n.template.line, column: n.template.column } : null,
      rect: n.rect,
      effects: n.effects.length,
      children: [],
    };
    byId.set(n.id, out);
    const parent = n.parent ? byId.get(n.parent) : undefined;
    if (parent) parent.children.push(out);
    else root ??= out;
  }
  return root;
}

/** The report for each boundary tree. */
export function sceneReport(trees: BoundaryTree[]): SceneReport[] {
  return trees.map((t) => ({
    id: t.id,
    label: t.label,
    kind: t.kind,
    count: t.nodes.length,
    root: nest(t.nodes),
    ...(t.error === undefined ? {} : { error: t.error }),
  }));
}

/** A hook box as the DOMRect-like object the overlay draws from. */
export function pageRectFor(r: PageRect): DOMRect {
  return { x: r.x, y: r.y, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height, width: r.width, height: r.height, toJSON: () => r } as DOMRect;
}
