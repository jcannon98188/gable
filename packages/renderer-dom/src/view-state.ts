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

// Reading scrollTop on every element forces a synchronous layout of the whole page (hundreds of ms on a large
// view), so scrolled elements are recorded as they scroll (scroll events do not bubble, but can be captured).
const tracked = new WeakSet<Document>();
const scrolled = new Set<WeakRef<Element>>();
const seen = new WeakSet<Element>();

/** Starts recording which elements of `doc` get scrolled. Idempotent. */
export function trackScroll(doc: Document): void {
  if (tracked.has(doc)) return;
  tracked.add(doc);
  doc.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (!target || (target as Node).nodeType !== 1) return;
      if (seen.has(target as Element)) return;
      seen.add(target as Element);
      scrolled.add(new WeakRef(target as Element));
    },
    { capture: true, passive: true },
  );
}

const liveScrolled = (): Set<Element> => {
  const live = new Set<Element>();
  for (const ref of scrolled) {
    const el = ref.deref();
    if (el) live.add(el);
    else scrolled.delete(ref);
  }
  return live;
};

const ancestry = (node: Node, top: Node | undefined): string => {
  const names: string[] = [];
  for (let n: Node | null = node; n; n = n === top ? null : n.parentNode) names.push(n.nodeName);
  return names.join("<");
};
const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const isText = (el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement => el.localName === "input" || el.localName === "textarea";

/** Visits every node under `roots` depth first. `path` is shared and mutated: copy it to keep it. */
function walk(roots: Node[], visit: (node: Node, path: number[]) => void): void {
  const path: number[] = [];
  const descend = (node: Node) => {
    visit(node, path);
    let i = 0;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      path.push(i++);
      descend(child);
      path.pop();
    }
  };
  for (let i = 0; i < roots.length; i++) {
    path.push(i);
    descend(roots[i]!);
    path.pop();
  }
}

export function captureViewState(roots: Node[]): ViewState {
  const entries: Entry[] = [];
  const moved = liveScrolled();
  const active = roots[0]?.ownerDocument?.activeElement ?? null;
  // Most elements keep nothing, so the entry (path copy and ancestry string) is only built for those that do.
  walk(roots, (node, path) => {
    if (!isElement(node)) return;
    const entry: Entry = { path: [], name: "" };
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
    if (moved.has(node as Element) && (node.scrollTop || node.scrollLeft)) {
      entry.scroll = [node.scrollTop, node.scrollLeft];
      keep = true;
    }
    if (node === active) {
      entry.focused = true;
      keep = true;
    }
    if (keep) {
      entry.path = path.slice();
      entry.name = ancestry(node, roots[path[0]!]);
      entries.push(entry);
    }
  });
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
      if (entry.checked !== undefined) (node as HTMLInputElement).checked = entry.checked;
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
