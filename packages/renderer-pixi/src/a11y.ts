// The semantic mirror (canvas/116): scene nodes tagged with the opt-in `[a11y]` property get a visually hidden DOM
// element, kept by Gable (never Pixi's accessibility plugin). This module is the mirror's logic: it tracks tagged nodes,
// orders and positions them, and hands the result to a sink (the DOM in the browser, a recorder in the scene test
// renderer). It is free of any pixi.js import and works on any node that has the structural shape below.

/** The opt-in `[a11y]` property of a scene tag. */
export interface A11yProps {
  /** ARIA role. `button` becomes a real `<button>`; any other role is a `div` with that role. */
  role: string;
  /** The accessible name. */
  label: string;
  description?: string;
  /** Whether the mirror element is a tab stop. Default: true for interactive roles (button, link, checkbox, ...), false otherwise. */
  focusable?: boolean;
  /** Sort key in the mirror (and so in the tab order). Default: the node's position in scene order. */
  order?: number;
}

/** The slice of a scene node the mirror needs. A Pixi `Container` satisfies it. */
export interface A11yNode {
  readonly visible: boolean;
  readonly parent: A11yNode | null;
  readonly children: readonly A11yNode[];
  getBounds(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  emit(name: string, ...args: any[]): unknown;
  /** Pixi's EventEmitter method; used so activation fires only handlers the node has. */
  listenerCount?(name: string): number;
}

/** A rectangle in canvas (CSS pixel) coordinates: where a mirror element sits over the canvas. */
export interface A11yBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One mirror element's worth of data, in tab order. */
export interface A11yEntry<N = A11yNode> {
  readonly node: N;
  readonly role: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly focusable: boolean;
  /** The effective sort key: `props.order`, else the scene-order index. */
  readonly order: number;
  /** In canvas (CSS pixel) coordinates. */
  readonly bounds: A11yBounds;
}

/** Where the mirror's entries go. `render` receives every visible tagged node in tab order, each time something may have changed. */
export interface A11ySink<N = A11yNode> {
  render(entries: readonly A11yEntry<N>[]): void;
  destroy(): void;
}

/** What a mirror activation passes to a node's `pointertap` (and `pointerup`, `click`, `tap`) handler: a minimal federated-event lookalike. */
export interface A11yActivationEvent {
  readonly type: "pointerup" | "pointertap" | "click" | "tap";
  readonly target: unknown;
  readonly currentTarget: unknown;
  readonly global: { readonly x: number; readonly y: number };
  /** Marks the tap as coming from assistive technology or the keyboard, not a pointer. */
  readonly pointerType: "a11y";
  readonly button: 0;
  readonly buttons: 0;
  /** The DOM event that caused it, when there was one. */
  readonly originalEvent: unknown;
  preventDefault(): void;
  stopPropagation(): void;
}

const INTERACTIVE_ROLES = new Set([
  "button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "slider", "spinbutton", "textbox", "combobox", "treeitem",
]);

/** The default for `focusable` from the role. */
export const isInteractiveRole = (role: string): boolean => INTERACTIVE_ROLES.has(role);

function validate(props: A11yProps): void {
  if (props === null || typeof props !== "object") throw new Error(`[a11y] expects { role, label, description?, focusable?, order? }, got ${String(props)}.`);
  if (typeof props.role !== "string" || props.role === "") throw new Error(`[a11y] needs a role, e.g. [a11y]="{ role: 'button', label: 'Start' }".`);
  if (typeof props.label !== "string" || props.label === "") throw new Error(`[a11y] needs a label (the accessible name) alongside role "${props.role}".`);
}

/** The semantic mirror of a scene: tracks the nodes tagged with `[a11y]`, orders them and works out their bounds, and renders them as hidden DOM elements through a sink. The renderer owns one and exposes it as `a11y`; `activate` fires a node's tap handlers for keyboard and assistive-technology activation. */
export class A11yMirror<N extends A11yNode = A11yNode> {
  readonly #props = new Map<N, A11yProps>();
  #sink: A11ySink<N> | null = null;
  #lastRoot: N | null = null;

  /** Sets (or with null/undefined removes) the node's mirror. */
  set(node: N, props: A11yProps | null | undefined): void {
    if (props === null || props === undefined) {
      this.#props.delete(node);
      return;
    }
    validate(props);
    this.#props.set(node, { ...props });
  }

  /** Forgets the node and every tagged descendant (the renderer calls this before destroying a subtree). */
  remove(node: N): void {
    if (this.#props.size === 0) return;
    const walk = (n: A11yNode) => {
      this.#props.delete(n as N);
      for (const child of n.children) walk(child);
    };
    walk(node);
  }

  /** Attaches the sink and renders into it at the next `sync`. A previously attached sink is destroyed. */
  attach(sink: A11ySink<N>): void {
    this.#sink?.destroy();
    this.#sink = sink;
    if (this.#lastRoot) this.sync(this.#lastRoot);
  }

  /** Detaches and destroys the sink; tagged nodes are kept. */
  detach(): void {
    this.#sink?.destroy();
    this.#sink = null;
  }

  get size(): number {
    return this.#props.size;
  }

  /** The tagged nodes as entries in tab order. A node that is invisible, or has an invisible ancestor, or is not under `root`, is left out. */
  entries(root: N): A11yEntry<N>[] {
    const out: Array<A11yEntry<N> & { index: number }> = [];
    if (this.#props.size > 0) {
      let index = 0;
      const walk = (node: A11yNode) => {
        if (!node.visible) return;
        const p = this.#props.get(node as N);
        if (p) {
          const b = node.getBounds();
          out.push({
            node: node as N,
            role: p.role,
            label: p.label,
            description: p.description,
            focusable: p.focusable ?? isInteractiveRole(p.role),
            order: p.order ?? index,
            bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
            index,
          });
          index++;
        }
        for (const child of node.children) walk(child);
      };
      walk(root);
    }
    out.sort((a, b) => a.order - b.order || a.index - b.index);
    return out.map(({ index: _i, ...entry }) => entry);
  }

  /** Recomputes the entries from the scene under `root` and renders them into the sink. The renderer calls this once per frame. */
  sync(root: N): void {
    this.#lastRoot = root;
    this.#sink?.render(this.entries(root));
  }

  /**
   * Dispatches the node's activation handlers, as if it were tapped at the centre of its bounds: `pointertap` always, and
   * `pointerup`, `click` and `tap` when the node listens to them (the same set the `scene-pointer-a11y` lint accepts, see
   * `ACTIVATION_EVENTS`), in the order of a real tap. A node that listens to both `pointertap` and `click` runs both, as under a mouse.
   * Returns false when the node has no mirror.
   */
  activate(node: N, originalEvent?: unknown): boolean {
    if (!this.#props.has(node)) return false;
    const b = node.getBounds();
    const fire = (type: A11yActivationEvent["type"]) => {
      const event: A11yActivationEvent = {
        type,
        target: node,
        currentTarget: node,
        global: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        pointerType: "a11y",
        button: 0,
        buttons: 0,
        originalEvent,
        preventDefault() {},
        stopPropagation() {},
      };
      node.emit(type, event);
    };
    const listens = (type: string) => (node.listenerCount?.(type) ?? 0) > 0;
    if (listens("pointerup")) fire("pointerup");
    fire("pointertap");
    if (listens("click")) fire("click");
    if (listens("tap")) fire("tap");
    return true;
  }
}
