import { effect, inject, input, output, signal, untracked, type ReadonlySignal } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import { ariaHidden } from "@zag-js/aria-hidden";
import { trackDismissableElement, type LayerType } from "@zag-js/dismissable";
import { trapFocus } from "@zag-js/focus-trap";
import { preventBodyScroll } from "@zag-js/remove-scroll";
import { MACHINE_ENV } from "./env.js";

/** Why a layer asked to close. */
export type LayerDismissReason = "escape" | "outside-click" | "focus-outside";

/** Options for `useLayer`. `open` is required; the rest tune dismissal and which modal behaviours (focus trap, scroll lock, hiding the rest of the page from assistive technology) apply. */
export interface LayerOptions {
  /** Whether the layer is open. Read inside an effect: signals it reads keep the layer in sync. */
  open: () => boolean;
  /** The user asked to close the layer (Escape, a click or focus outside). Only the topmost layer is asked. The owner decides whether to close. */
  onDismiss?: (reason: LayerDismissReason) => void;
  /** The layer's root element. Default: the host element the layer is set up on. */
  element?: () => HTMLElement | null;
  /** Layer type, used by the layer stack for nesting metadata (`data-nested`, `--layer-index`). Default `"dialog"`. */
  type?: LayerType;
  /**
   * Modal layers trap focus, lock page scroll and hide everything outside from assistive technology. Default true.
   * A non-modal layer (a popover, a menu) only tracks dismissal.
   */
  modal?: boolean;
  /** Override one modal behaviour. Each defaults to `modal`. */
  trapFocus?: boolean;
  scrollLock?: boolean;
  hideOutside?: boolean;
  /** Return focus to the previously focused element when the layer closes. Default true. */
  restoreFocus?: boolean;
  /** What to focus when the layer opens: an element, a selector inside the layer, or a getter. Default: the first tabbable element. */
  initialFocus?: HTMLElement | string | (() => HTMLElement | null);
  /** Close on Escape. Default true. Read when the key is pressed. */
  closeOnEscape?: boolean;
  /** Close on a pointer press or focus move outside the layer. Default true. Read when the event happens. */
  closeOnOutside?: boolean;
  /** Elements outside the layer that do not count as outside (e.g. the trigger) and stay visible to assistive technology. */
  persistentElements?: Array<() => Element | null>;
}

/** What `useLayer` returns: whether its DOM behaviours are currently installed. */
export interface LayerHandle {
  /** True while the layer's DOM behaviours are installed (open, and under a DOM renderer). */
  readonly active: ReadonlySignal<boolean>;
}

/**
 * A dismissable layer: the shared behaviour under dialogs, popovers, menus and listboxes. Call it during Setup;
 * everything it installs is removed when the layer closes and when the owning scope is disposed.
 *
 * It composes Zag's utilities and adds only the Gable seams (scope ownership, signals, renderer awareness):
 * - **Layer stack** (`@zag-js/dismissable`, the same stack Zag's own machines use, so a Zag Dialog and a `useLayer`
 *   popover nest correctly): Escape asks only the topmost layer. A pointer press or focus move outside asks only
 *   the topmost layer too (a lower layer stays until the next one). Clicks inside a nested layer are not "outside" for its parents.
 *   Closing a layer also closes the layers nested above it.
 * - **Focus trap and restore** (`@zag-js/focus-trap`): Tab cycles inside the layer; focus returns to the element that had it on close.
 * - **Scroll lock** (`@zag-js/remove-scroll`): the page does not scroll while a modal layer is open.
 * - **Hide outside** (`@zag-js/aria-hidden`): everything outside the layer gets `aria-hidden`.
 *
 * The layer never closes itself; `onDismiss` tells the owner, who sets its open state.
 *
 * Under a renderer that is not a DOM (the in-memory test renderer) nothing is installed and `active` stays false
 * (`MACHINE_ENV.effects` overrides that). Test dismissal and focus behaviour in jsdom.
 */
export function useLayer<N = unknown>(options: LayerOptions, target: { host: N } = injectHost<N>()): LayerHandle {
  const { host } = target;
  const env = inject(MACHINE_ENV, { optional: true });
  const isDom = !!host && (host as { nodeType?: number }).nodeType === 1 && typeof (host as { getRootNode?: unknown }).getRootNode === "function";
  const effects = env?.effects ?? isDom;
  const active = signal(false);
  let stop: (() => void) | null = null;

  const start = (cfg: { modal: boolean; trap: boolean; lock: boolean; hide: boolean; type: LayerType }) => {
    const el = (options.element ? options.element() : (host as unknown as HTMLElement)) as HTMLElement | null;
    if (!el) return;
    const cleanups: Array<() => void> = [];

    cleanups.push(() => {
      // The stack leaves its position marker on the element after removal; a stale one would look like a higher layer.
      el.style.removeProperty("--layer-index");
      el.style.removeProperty("--nested-layer-count");
      el.removeAttribute("data-nested");
      el.removeAttribute("data-has-nested");
    });
    cleanups.push(
      trackDismissableElement(el, {
        type: cfg.type,
        defer: true,
        persistentElements: options.persistentElements,
        onDismiss: (event) => {
          const type = (event as { type?: string } | undefined)?.type ?? "";
          options.onDismiss?.(type === "keydown" ? "escape" : type.includes("focus") ? "focus-outside" : "outside-click");
        },
        onEscapeKeyDown(event) {
          if (options.closeOnEscape === false) event.preventDefault();
        },
        onInteractOutside(event) {
          // Zag offers the event to every layer; only the topmost may close.
          if (options.closeOnOutside === false || !isTopmostLayer(el)) event.preventDefault();
        },
      }),
    );
    if (cfg.trap) {
      if (!el.hasAttribute("tabindex")) {
        el.setAttribute("tabindex", "-1"); // a fallback focus target when the layer has nothing tabbable
        cleanups.push(() => el.removeAttribute("tabindex"));
      }
      cleanups.push(
        trapFocus(el, {
          fallbackFocus: el,
          initialFocus: options.initialFocus as never,
          returnFocusOnDeactivate: options.restoreFocus ?? true,
          escapeDeactivates: false,
          clickOutsideDeactivates: false,
          allowOutsideClick: true,
          preventScroll: true,
        }),
      );
    }
    if (cfg.lock) cleanups.push(preventBodyScroll(el.ownerDocument));
    if (cfg.hide) cleanups.push(ariaHidden(() => [el, ...(options.persistentElements ?? []).map((get) => get() as HTMLElement | null)], { defer: true }));
    active.set(true);
    stop = () => {
      stop = null;
      for (const c of cleanups.reverse()) c();
      active.set(false);
    };
  };

  effect(() => {
    const open = options.open();
    const modal = options.modal ?? true;
    const cfg = { modal, trap: options.trapFocus ?? modal, lock: options.scrollLock ?? modal, hide: options.hideOutside ?? modal, type: options.type ?? "dialog" };
    untracked(() => {
      stop?.();
      if (open && effects) start(cfg);
    });
  });
  currentScope()?.onDispose(() => untracked(() => stop?.()));
  return { active };
}

/**
 * Whether `node` is the topmost layer of Zag's layer stack (ignoring `hidden` elements, which Zag machines leave a stale marker on when they close). The stack object is private to `@zag-js/dismissable`, but it
 * publishes each layer's position as the `--layer-index` custom property on the layer element, so compare those.
 */
export function isTopmostLayer(node: HTMLElement): boolean {
  const own = layerIndex(node);
  if (own < 0) return true;
  let top = own;
  for (const other of node.ownerDocument.querySelectorAll<HTMLElement>('[style*="--layer-index"]')) if (!other.hidden) top = Math.max(top, layerIndex(other));
  return own >= top;
}
const layerIndex = (el: HTMLElement): number => {
  const n = parseInt(el.style.getPropertyValue("--layer-index"), 10);
  return Number.isNaN(n) ? -1 : n;
};

/**
 * `<div uiLayer [open]="open()" (dismiss)="open.set(false)">`: a dismissable layer on the element. Set `[modal]="false"`
 * for popovers and menus. Use `useLayer` directly for options the inputs do not cover (persistent elements, initial focus).
 */
export class UiLayer {
  static meta = { selector: "[uiLayer]" };
  open = input<boolean>(true);
  modal = input<boolean>(true);
  type = input<string>("dialog");
  closeOnEscape = input<boolean>(true);
  closeOnOutside = input<boolean>(true);
  dismiss = output<LayerDismissReason>();
  private _layer = useLayer(optionsOf(this));
}

function optionsOf(self: UiLayer): LayerOptions {
  return {
    open: () => self.open(),
    get modal() {
      return self.modal();
    },
    get type() {
      return self.type();
    },
    get closeOnEscape() {
      return self.closeOnEscape();
    },
    get closeOnOutside() {
      return self.closeOnOutside();
    },
    onDismiss: (reason) => self.dismiss.emit(reason),
  };
}
