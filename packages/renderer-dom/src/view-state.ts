// Dev only (HMR): focus, selection, scroll offsets and control values across a view rebuild.
// Matching is by structural path (root index, then child indexes) and tag; best effort.

interface Entry {
  path: number[];
  /** Node names from the root down to this node: a match needs the same ancestry, not just the same position. */
  name: string;
  value?: string;
  checked?: boolean;
  /** Selected option indexes of a <select multiple>. */
  selected?: number[];
  scroll?: [number, number];
  focused?: boolean;
  selection?: [number | null, number | null, "forward" | "backward" | "none" | null];
}

export interface ViewState {
  entries: Entry[];
}

const ancestry = (node: Node, top: Node | undefined): string => {
  const names: string[] = [];
  for (let n: Node | null = node; n; n = n === top ? null : n.parentNode) names.push(n.nodeName);
  return names.join("<");
};
const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const isText = (el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement => el.localName === "input" || el.localName === "textarea";

function* walk(roots: Node[]): Generator<{ node: Node; path: number[] }> {
  const visit = function* (node: Node, path: number[]): Generator<{ node: Node; path: number[] }> {
    yield { node, path };
    let i = 0;
    for (let child = node.firstChild; child; child = child.nextSibling) yield* visit(child, [...path, i++]);
  };
  for (let i = 0; i < roots.length; i++) yield* visit(roots[i]!, [i]);
}

export function captureViewState(roots: Node[]): ViewState {
  const entries: Entry[] = [];
  const active = roots[0]?.ownerDocument?.activeElement ?? null;
  for (const { node, path } of walk(roots)) {
    if (!isElement(node)) continue;
    const entry: Entry = { path, name: ancestry(node, roots[path[0]!]) };
    let keep = false;
    if (isText(node)) {
      const type = (node as HTMLInputElement).type;
      if (type === "checkbox" || type === "radio") entry.checked = (node as HTMLInputElement).checked;
      else if (type !== "file") entry.value = node.value;
      keep = true;
      if (node === active) {
        try {
          entry.selection = [node.selectionStart, node.selectionEnd, node.selectionDirection];
        } catch {
          // types without a selection (number, email)
        }
      }
    } else if (node.localName === "select") {
      const select = node as unknown as HTMLSelectElement;
      entry.selected = [...select.options].flatMap((o, i) => (o.selected ? [i] : []));
      keep = true;
    }
    if (node.scrollTop || node.scrollLeft) {
      entry.scroll = [node.scrollTop, node.scrollLeft];
      keep = true;
    }
    if (node === active) {
      entry.focused = true;
      keep = true;
    }
    if (keep) entries.push(entry);
  }
  return { entries };
}

export function restoreViewState(roots: Node[], state: ViewState): void {
  const at = (path: number[]): Node | undefined => {
    let node: Node | undefined = roots[path[0]!];
    for (const i of path.slice(1)) node = node?.childNodes[i];
    return node;
  };
  let focus: { el: HTMLElement; entry: Entry } | undefined;
  for (const entry of state.entries) {
    const node = at(entry.path);
    if (!node || !isElement(node) || ancestry(node, roots[entry.path[0]!]) !== entry.name) continue;
    if (isText(node)) {
      if (entry.checked !== undefined) node.checked = entry.checked;
      else if (entry.value !== undefined && node.value !== entry.value) node.value = entry.value;
    } else if (entry.selected && node.localName === "select") {
      [...(node as unknown as HTMLSelectElement).options].forEach((o, i) => (o.selected = entry.selected!.includes(i)));
    }
    if (entry.scroll) {
      node.scrollTop = entry.scroll[0];
      node.scrollLeft = entry.scroll[1];
    }
    if (entry.focused) focus = { el: node, entry };
  }
  if (!focus) return;
  focus.el.focus({ preventScroll: true });
  const sel = focus.entry.selection;
  if (sel && sel[0] !== null && sel[1] !== null && isText(focus.el)) {
    try {
      focus.el.setSelectionRange(sel[0], sel[1], sel[2] ?? undefined);
    } catch {
      // not selectable
    }
  }
}
