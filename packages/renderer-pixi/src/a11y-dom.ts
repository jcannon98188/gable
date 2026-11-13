// The DOM sink of the semantic mirror (TASK-104.11): a visually hidden subtree inside the canvas host, one real element
// per tagged node. The elements are transparent rather than hidden, so they keep their place in the accessibility tree
// and a focused one shows an ordinary DOM focus ring at the node's bounds (which honours forced colours). They never
// intercept the pointer. Tab and Escape are never handled here.
import type { A11yBounds, A11yEntry, A11ySink } from "./a11y.js";

let nextId = 0;

interface Slot {
  readonly el: HTMLElement;
  readonly desc: HTMLElement;
  role: string;
  label: string;
  description: string | undefined;
  focusable: boolean | null;
  bounds: A11yBounds | null;
}

export class DomA11ySink<N> implements A11ySink<N> {
  readonly #container: HTMLElement;
  readonly #slots = new Map<N, Slot>();
  readonly #activate: (node: N, event: Event) => void;
  readonly #stops: ((count: number) => void) | undefined;

  /**
   * `activate` is called with the node and the DOM event when a mirror element is clicked, or Enter or Space is pressed on a
   * non-button one. `onTabStops` is told how many focusable mirror elements exist after each render.
   */
  constructor(host: HTMLElement, activate: (node: N, event: Event) => void, onTabStops?: (count: number) => void) {
    this.#activate = activate;
    this.#stops = onTabStops;
    const container = host.ownerDocument.createElement("div");
    container.setAttribute("data-gable-a11y", "");
    Object.assign(container.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" });
    host.appendChild(container);
    this.#container = container;
  }

  render(entries: readonly A11yEntry<N>[]): void {
    const wanted = new Set<N>();
    let stops = 0;
    entries.forEach((entry, i) => {
      wanted.add(entry.node);
      let slot = this.#slots.get(entry.node);
      if (slot && slot.role !== entry.role) {
        // The element type depends on the role; a role change builds a new element.
        slot.el.remove();
        this.#slots.delete(entry.node);
        slot = undefined;
      }
      if (!slot) {
        slot = this.#create(entry);
        this.#slots.set(entry.node, slot);
      }
      this.#update(slot, entry);
      if (entry.focusable) stops++;
      // Keep DOM order equal to tab order: only touch the DOM when the element is not already in place.
      if (this.#container.children[i] !== slot.el) this.#container.insertBefore(slot.el, this.#container.children[i] ?? null);
    });
    for (const [node, slot] of this.#slots) {
      if (wanted.has(node)) continue;
      slot.el.remove();
      this.#slots.delete(node);
    }
    this.#stops?.(stops);
  }

  destroy(): void {
    this.#container.remove();
    this.#slots.clear();
    this.#stops?.(0);
  }

  #create(entry: A11yEntry<N>): Slot {
    const doc = this.#container.ownerDocument;
    const isButton = entry.role === "button";
    const el = doc.createElement(isButton ? "button" : "div");
    if (isButton) el.setAttribute("type", "button");
    else el.setAttribute("role", entry.role);
    const desc = doc.createElement("span");
    desc.id = `gable-a11y-desc-${++nextId}`;
    desc.hidden = true;
    const s = el.style;
    s.position = "absolute";
    s.pointerEvents = "none";
    s.background = "transparent";
    s.color = "transparent";
    s.border = "0";
    s.padding = "0";
    s.margin = "0";
    s.overflow = "hidden";
    s.boxSizing = "border-box";
    el.addEventListener("click", (event) => this.#activate(entry.node, event));
    // Enter and Space on a mirror element are activation, not game input: keep them (down and up) from the host's Keyboard service.
    // Tab, Escape and the rest bubble untouched.
    const isActivationKey = (event: KeyboardEvent) => event.key === "Enter" || event.key === " " || event.code === "Space";
    el.addEventListener("keyup", (e) => {
      const event = e as KeyboardEvent;
      if (event.target === el && isActivationKey(event)) event.stopPropagation();
    });
    el.addEventListener("keydown", (e) => {
      const event = e as KeyboardEvent;
      if (!isActivationKey(event) || event.target !== el) return;
      event.stopPropagation();
      // A native button turns Enter and Space into clicks itself. Anything else needs them here.
      if (isButton) return;
      event.preventDefault(); // Space would scroll the page
      this.#activate(entry.node, event);
    });
    return { el, desc, role: entry.role, label: "", description: undefined, focusable: null, bounds: null };
  }

  #update(slot: Slot, entry: A11yEntry<N>): void {
    const { el } = slot;
    if (slot.label !== entry.label || el.getAttribute("aria-label") === null) {
      el.setAttribute("aria-label", entry.label);
      slot.label = entry.label;
    }
    if (slot.description !== entry.description || (entry.description !== undefined && !slot.desc.isConnected)) {
      if (entry.description === undefined) {
        el.removeAttribute("aria-describedby");
        slot.desc.remove();
      } else {
        slot.desc.textContent = entry.description;
        el.setAttribute("aria-describedby", slot.desc.id);
        el.appendChild(slot.desc);
      }
      slot.description = entry.description;
    }
    if (slot.focusable !== entry.focusable) {
      if (entry.role === "button") el.tabIndex = entry.focusable ? 0 : -1;
      else if (entry.focusable) el.tabIndex = 0;
      else el.removeAttribute("tabindex");
      slot.focusable = entry.focusable;
    }
    const b = entry.bounds;
    const old = slot.bounds;
    if (!old || old.x !== b.x || old.y !== b.y || old.width !== b.width || old.height !== b.height) {
      const s = el.style;
      s.left = `${Math.round(b.x)}px`;
      s.top = `${Math.round(b.y)}px`;
      s.width = `${Math.max(1, Math.round(b.width))}px`;
      s.height = `${Math.max(1, Math.round(b.height))}px`;
      slot.bounds = { ...b };
    }
  }
}
