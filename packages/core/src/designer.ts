// The design-tooling layer (`@gable/core/designer`). Dev only: nothing imports this file except behind `if (DEV)` or from a
// tool that installs it, so a production build never carries it. It fills the runtime's `design` slot (see `dev-hooks.ts`)
// and exposes `globalThis.__GABLE_DESIGNER_HOOK__` to the Designer's preview agent. It is separate from the devtools
// hook on purpose: it sees template nodes and intercepts event listeners, which an inspection protocol should not offer.
// No semver promise.
import { design, type DesignSink } from "./dev-hooks.js";
import type { SourceInfo } from "./devtools.js";
import type { Provider } from "./di.js";

/** A template element, and where it sits in its template's source. Offsets are into `raw` (the template literal's text as written), not into the file. */
export interface DesignNode {
  /** Stable for as long as the template (this version of it) lives; a hot update that changes the template yields new ids. */
  id: string;
  tag: string;
  /** The template literal's text (`strings.raw[0]`); a file-level tool finds the literal by this. */
  raw: string;
  /**
   * False when the template contains escapes (a backslash): the runtime parses the cooked text, so the offsets below do not
   * line up with `raw` and a tool must not map them to the file.
   */
  exact: boolean;
  /** Offset of the `<`. */
  start: number;
  /** Offset just after the opening tag. */
  openEnd: number;
  /** Offset just after the element. */
  end: number;
  /** The component whose template contains the element (a projected element belongs to its author, not to the component hosting it). */
  component: { id: string; name: string; source: SourceInfo | null } | null;
  /** How many live elements were rendered from it: many under `@for`, none when an `@if` is false. */
  elements: number;
}

export interface DesignerHook {
  readonly version: 1;
  /** While muted, the app does not see user events (click, keys, focus, input...) at the Renderer's `listen`. */
  muted: boolean;
  /** Providers `bootstrap` adds to the root injector after the app's own (the Designer's page-mode Scenario). Set before the app starts. */
  rootProviders: Provider[];
  /** The template node that produced `element`, or that of its nearest ancestor that has one. `null` for anything not built from a template. */
  nodeOf(element: unknown): DesignNode | null;
  /** Every live element rendered from a template node. */
  elementsOf(id: string): unknown[];
  /** The innermost rendered template node of the template whose literal text is `raw` that contains `offset`. */
  nodeAt(raw: string, offset: number): DesignNode | null;
}

interface Entry {
  id: string;
  node: { tag: string; pos?: { start: number; openEnd: number; end: number; tpl: TemplateStringsArray } };
  instance: WeakRef<object>;
  elements: Set<WeakRef<object>>;
}

/** Events a user causes: muted in design mode so selecting an element never runs the app's handlers. */
const USER_EVENTS = new Set([
  "click", "dblclick", "auxclick", "contextmenu", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend",
  "keydown", "keyup", "keypress", "beforeinput", "input", "change", "submit", "reset", "focus", "blur", "focusin", "focusout",
  "dragstart", "dragend", "drop", "paste", "cut", "copy",
]);

const live = (ref: WeakRef<object>): object | undefined => {
  const el = ref.deref();
  return el && (el as { isConnected?: boolean }).isConnected !== false ? el : undefined;
};

/** The one thing the layer asks of the devtools hook, when one is installed. */
interface DevtoolsLike {
  componentOfInstance(instance: object): DesignNode["component"];
}

export interface DesignerInstance {
  hook: DesignerHook;
  sink: DesignSink;
  /** Detaches the sink and removes the global (tests). */
  dispose(): void;
}

/** Creates the layer and fills the runtime's `design` slot. Prefer `installDesigner`; tests call this directly. */
export function createDesigner(target?: { __GABLE_DESIGNER_HOOK__?: DesignerHook; __GABLE_DEVTOOLS_HOOK__?: DevtoolsLike }): DesignerInstance {
  const byNode = new WeakMap<object, Entry>();
  const byElement = new WeakMap<object, Entry>();
  /** The component instance that rendered each element: a template node is shared by every instance of its component. */
  const ownerOf = new WeakMap<object, object>();
  const byId = new Map<string, Entry>();
  const templates = new WeakMap<TemplateStringsArray, number>();
  let templateCount = 0;
  let sinceSweep = 0;

  const sweep = () => {
    sinceSweep = 0;
    for (const [id, entry] of byId) {
      for (const ref of entry.elements) if (!live(ref)) entry.elements.delete(ref);
      if (entry.elements.size === 0) byId.delete(id);
    }
  };

  const info = (entry: Entry, el?: object): DesignNode => {
    const { start, openEnd, end, tpl } = entry.node.pos!;
    const instance = (el && ownerOf.get(el)) ?? entry.instance.deref();
    const devtools = (target ?? (globalThis as { __GABLE_DEVTOOLS_HOOK__?: DevtoolsLike })).__GABLE_DEVTOOLS_HOOK__;
    return {
      id: entry.id,
      tag: entry.node.tag,
      raw: tpl.raw[0]!,
      exact: tpl[0] === tpl.raw[0],
      start,
      openEnd,
      end,
      component: (instance && devtools?.componentOfInstance(instance)) || null,
      elements: [...entry.elements].filter(live).length,
    };
  };

  const hook: DesignerHook = {
    version: 1,
    muted: false,
    rootProviders: [],
    nodeOf(element) {
      for (let n = element as any; n && typeof n === "object"; n = n.parentNode ?? n.parent) {
        const entry = byElement.get(n);
        if (entry) return info(entry, n);
      }
      return null;
    },
    elementsOf(id) {
      const entry = byId.get(id);
      return entry ? [...entry.elements].map(live).filter((el): el is object => !!el) : [];
    },
    nodeAt(raw, offset) {
      let best: Entry | null = null;
      for (const entry of byId.values()) {
        const pos = entry.node.pos!;
        if (pos.tpl.raw[0] !== raw || offset < pos.start || offset >= pos.end) continue;
        if (![...entry.elements].some(live)) continue;
        if (!best || pos.end - pos.start < best.node.pos!.end - best.node.pos!.start) best = entry;
      }
      return best ? info(best) : null;
    },
  };

  const sink: DesignSink = {
    element(el, node, instance) {
      const n = node as Entry["node"];
      if (!el || typeof el !== "object" || !n.pos) return;
      let entry = byNode.get(node);
      if (!entry) {
        const { tpl, start } = n.pos;
        let index = templates.get(tpl);
        if (index === undefined) templates.set(tpl, (index = ++templateCount));
        entry = { id: `t${index}:${start}`, node: n, instance: new WeakRef(instance), elements: new Set() };
        byNode.set(node, entry);
        byId.set(entry.id, entry);
      }
      // The latest instance to render the node: an earlier one may be destroyed (a remounted scene, a closed route).
      else if (entry.instance.deref() !== instance) entry.instance = new WeakRef(instance);
      entry.elements.add(new WeakRef(el));
      byElement.set(el, entry);
      ownerOf.set(el, instance);
      if (++sinceSweep > 2000) sweep();
    },
    listener(_el, name, handler) {
      return USER_EVENTS.has(name) ? (event) => void (hook.muted || handler(event)) : handler;
    },
  };

  design.current = sink;
  if (target) target.__GABLE_DESIGNER_HOOK__ = hook;
  return {
    hook,
    sink,
    dispose() {
      if (design.current === sink) design.current = null;
      if (target?.__GABLE_DESIGNER_HOOK__ === hook) delete target.__GABLE_DESIGNER_HOOK__;
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __GABLE_DESIGNER_HOOK__: DesignerHook | undefined;
}

/** Installs the layer as `globalThis.__GABLE_DESIGNER_HOOK__` once, before the app builds any element. */
export function installDesigner(): DesignerHook {
  const existing = globalThis.__GABLE_DESIGNER_HOOK__;
  if (existing) return existing;
  return createDesigner(globalThis).hook;
}
