import { effect, input, signal, untracked, type ReadonlySignal } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";

export type RovingOrientation = "horizontal" | "vertical" | "both";

export interface RovingOptions<N> {
  /**
   * The items, in order. Called on every key press and focus change, so it may read the live DOM
   * (`querySelectorAll`) or a signal. Required unless `selector` is given.
   */
  items?: () => N[];
  /** DOM shortcut for `items`: the host's descendants matching this selector. */
  selector?: string;
  /** Which arrow keys move: `"horizontal"` (default), `"vertical"` or `"both"`. */
  orientation?: RovingOrientation;
  /** Wrap from the last item to the first and back. Default true. */
  loop?: boolean;
  /** Right-to-left: swaps Left and Right. Default false. */
  rtl?: boolean;
  /** Items that are skipped. Default: a `disabled` or `aria-disabled="true"` attribute. */
  isDisabled?: (item: N) => boolean;
  /** Moves focus to an item. Default: `item.focus()`. */
  focus?: (item: N) => void;
  /** The item that holds the tab stop initially. Default: the first enabled item. */
  initial?: () => N | null | undefined;
}

export interface RovingHandle<N> {
  /** The item that currently holds the tab stop (`tabindex="0"`), or null. */
  readonly active: ReadonlySignal<N | null>;
  /** Moves the tab stop to `item` and focuses it. */
  focus(item: N): void;
  /** Re-reads the items and re-applies `tabindex`: call it after items were added, removed or enabled. */
  refresh(): void;
}

/**
 * Roving tabindex: exactly one item of a group is in the tab order (`tabindex="0"`, the others `-1`); arrow keys,
 * Home and End move focus between items and move the tab stop with it; Tab leaves the group. Use it for toolbars,
 * radio-like groups and menus. (Zag machines such as tabs and menu already do this internally; this is for composite
 * widgets that have no machine.)
 *
 * It listens on the host for `keydown` and `focusin` (events from items bubble to the host), and is renderer neutral:
 * it only uses `Renderer.listen` and `setAttribute`, with `items` and `focus` supplying the node-specific parts. Call it
 * during Setup; the listeners go with the scope.
 */
export function useRovingTabindex<N = unknown>(options: RovingOptions<N>, target: { renderer: Renderer<N>; host: N } = injectHost<N>()): RovingHandle<N> {
  const { renderer, host } = target;
  const getItems =
    options.items ??
    (() => {
      const root = host as unknown as { querySelectorAll?(selector: string): ArrayLike<N> };
      if (!options.selector || !root.querySelectorAll) throw new Error("useRovingTabindex needs `items`, or `selector` on a renderer whose nodes support querySelectorAll.");
      return Array.from(root.querySelectorAll(options.selector));
    });
  const disabled =
    options.isDisabled ??
    ((item: N) => {
      const el = item as unknown as { hasAttribute?(n: string): boolean; getAttribute?(n: string): string | null };
      return !!el.hasAttribute?.("disabled") || el.getAttribute?.("aria-disabled") === "true";
    });
  const focusItem = options.focus ?? ((item: N) => (item as unknown as { focus?(): void }).focus?.());
  const active = signal<N | null>(null);

  const apply = (items: N[]) => {
    let stop = untracked(active);
    if (!stop || !items.includes(stop) || disabled(stop)) stop = (options.initial?.() && items.includes(options.initial()!) ? options.initial()! : undefined) ?? items.find((i) => !disabled(i)) ?? null;
    for (const item of items) renderer.setAttribute(item, "tabindex", item === stop ? "0" : "-1");
    if (stop !== untracked(active)) active.set(stop);
  };
  const refresh = () => untracked(() => apply(getItems()));
  const indexOf = (items: N[], node: unknown) => items.findIndex((i) => i === node || !!(i as unknown as { contains?(n: unknown): boolean }).contains?.(node));

  const move = (items: N[], from: number, step: 1 | -1): N | undefined => {
    for (let n = 1; n <= items.length; n++) {
      let next = from + step * n;
      if (next < 0 || next >= items.length) {
        if (options.loop === false) return undefined;
        next = (next + items.length) % items.length;
      }
      if (!disabled(items[next]!)) return items[next];
    }
    return undefined;
  };

  const off = [
    renderer.listen(host, "focusin", (event) => {
      const items = getItems();
      const i = indexOf(items, (event as { target?: unknown }).target);
      if (i >= 0 && !disabled(items[i]!)) {
        active.set(items[i]!);
        apply(items);
      }
    }),
    renderer.listen(host, "keydown", (event) => {
      const e = event as { key: string; target?: unknown; preventDefault(): void; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const items = getItems();
      const from = indexOf(items, e.target);
      if (from < 0) return;
      const orientation = options.orientation ?? "horizontal";
      const horizontal = orientation !== "vertical";
      const vertical = orientation !== "horizontal";
      const back = rtlKey(options.rtl);
      let next: N | undefined;
      if ((horizontal && e.key === back.previous) || (vertical && e.key === "ArrowUp")) next = move(items, from, -1);
      else if ((horizontal && e.key === back.next) || (vertical && e.key === "ArrowDown")) next = move(items, from, 1);
      else if (e.key === "Home") next = disabled(items[0]!) ? move(items, 0, 1) : items[0];
      else if (e.key === "End") next = disabled(items[items.length - 1]!) ? move(items, items.length - 1, -1) : items[items.length - 1];
      else return;
      e.preventDefault();
      if (next !== undefined) handle.focus(next);
    }),
  ];
  const handle: RovingHandle<N> = {
    active,
    refresh,
    focus(item) {
      active.set(item);
      apply(untracked(getItems));
      focusItem(item);
    },
  };
  effect(() => {
    apply(getItems()); // reads signals the items getter uses, so a signal-driven list stays in sync
  });
  currentScope()?.onDispose(() => off.forEach((f) => f()));
  return handle;
}
const rtlKey = (rtl?: boolean) => (rtl ? { previous: "ArrowRight", next: "ArrowLeft" } : { previous: "ArrowLeft", next: "ArrowRight" });

/**
 * `<div uiRoving orientation="vertical" rovingSelector="[role=menuitem]">`: roving tabindex over the descendants matching
 * the selector (default `[data-roving-item]`; mark items with the `uiRovingItem` directive). Needs a DOM renderer; use
 * `useRovingTabindex` with `items` for other renderers. Items added later: call `refresh` or add the item through a signal-driven `items`.
 */
export class UiRoving {
  static meta = { selector: "[uiRoving]" };
  orientation = input<RovingOrientation>("horizontal");
  loop = input<boolean>(true);
  rovingSelector = input<string>("[data-roving-item]");
  roving = rovingFor(this);
}

function rovingFor(self: UiRoving): RovingHandle<unknown> {
  const target = injectHost<unknown>();
  const handle = useRovingTabindex<unknown>(
    {
      get selector() {
        return self.rovingSelector();
      },
      get orientation() {
        return self.orientation();
      },
      get loop() {
        return self.loop();
      },
    },
    target,
  );
  // Items are created after this directive is set up and may come and go: re-apply the tab stop when the subtree changes.
  const host = target.host as { nodeType?: number; ownerDocument?: { defaultView?: { MutationObserver?: typeof MutationObserver } | null } };
  const Observer = host?.ownerDocument?.defaultView?.MutationObserver;
  if (Observer) {
    const observer = new Observer(() => handle.refresh());
    observer.observe(host as unknown as Node, { childList: true, subtree: true });
    currentScope()?.onDispose(() => observer.disconnect());
  }
  return handle;
}

/** Marks an element as an item of the nearest `uiRoving` group (`data-roving-item`). */
export class UiRovingItem {
  static meta = { selector: "[uiRovingItem]" };
  private _mark = (() => {
    const { renderer, host } = injectHost<unknown>();
    renderer.setAttribute(host, "data-roving-item", "");
  })();
}
