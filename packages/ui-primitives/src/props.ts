import { effect } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";

/** The attribute bag a Zag prop getter returns, after `normalizeProps` (lower-cased keys, `on*` handlers). */
export type PropBag = Record<string, unknown>;

const PROPERTY_KEYS = new Set(["value", "checked", "selected"]);

/** Applies one prop bag to a node and returns the previous-state record for the next diff. */
function diff<N>(renderer: Renderer<N>, node: N, prev: Applied, bag: PropBag): Applied {
  const next: Applied = { attrs: new Map(), classes: new Set(), styles: new Map(), listeners: new Map() };
  for (const [key, value] of Object.entries(bag)) {
    if (value === undefined || value === null || key === "children") continue;
    if (key.startsWith("on") && typeof value === "function") {
      const name = key.slice(2);
      const old = prev.listeners.get(name);
      // The bag's handlers are re-created on every connect, so one stable listener delegates to the latest.
      if (old) {
        old.handler = value as Handler;
        next.listeners.set(name, old);
      } else {
        const entry: ListenerEntry = { handler: value as Handler, off: () => {} };
        entry.off = renderer.listen(node, name, (event) => entry.handler(event));
        next.listeners.set(name, entry);
      }
    } else if (key === "class") {
      for (const name of String(value).split(/\s+/).filter(Boolean)) next.classes.add(name);
    } else if (key === "style") {
      if (typeof value === "string") next.attrs.set("style", value);
      else for (const [prop, v] of Object.entries(value as Record<string, unknown>)) if (v != null) next.styles.set(cssName(prop), String(v));
    } else if (PROPERTY_KEYS.has(key)) {
      renderer.setProperty(node, key, value);
    } else if (typeof value === "boolean" && !key.startsWith("aria-")) {
      if (value) next.attrs.set(key, "");
    } else {
      next.attrs.set(key, String(value));
    }
  }
  for (const [name, entry] of prev.listeners) if (!next.listeners.has(name)) entry.off();
  for (const name of prev.attrs.keys()) if (!next.attrs.has(name)) renderer.setAttribute(node, name, null);
  for (const [name, value] of next.attrs) if (prev.attrs.get(name) !== value) renderer.setAttribute(node, name, value);
  for (const name of prev.classes) if (!next.classes.has(name)) renderer.setClass(node, name, false);
  for (const name of next.classes) if (!prev.classes.has(name)) renderer.setClass(node, name, true);
  for (const name of prev.styles.keys()) if (!next.styles.has(name)) renderer.setStyle(node, name, null);
  for (const [name, value] of next.styles) if (prev.styles.get(name) !== value) renderer.setStyle(node, name, value);
  return next;
}

type Handler = (event: unknown) => void;
interface ListenerEntry {
  handler: Handler;
  off: () => void;
}
interface Applied {
  attrs: Map<string, string>;
  classes: Set<string>;
  styles: Map<string, string>;
  listeners: Map<string, ListenerEntry>;
}

const cssName = (key: string) => (key.startsWith("--") ? key : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));

/**
 * Spreads a reactive Zag prop bag onto a node (templates have no `{...props}`, so this is the "prop getters as host
 * bindings" seam). A getter may return null to apply nothing yet (a required input is unset until the parent binds it, after Setup). Call during Setup: the effect and its listeners are owned by the current scope.
 */
export function bindProps<N = unknown>(bag: () => PropBag | null, target: { renderer: Renderer<N>; host: N } = injectHost<N>()): void {
  const { renderer, host } = target;
  let applied: Applied = { attrs: new Map(), classes: new Set(), styles: new Map(), listeners: new Map() };
  effect(() => {
    const next = bag();
    if (next) applied = diff(renderer, host, applied, next);
  });
  // Listeners outlive the effect run, so remove them with the scope.
  currentScope()?.onDispose(() => {
    for (const entry of applied.listeners.values()) entry.off();
  });
}

