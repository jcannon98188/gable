import { effect, inject, input, signal, untracked, type ReadonlySignal } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";
import { autoUpdate, computePosition, flip, offset as offsetMiddleware, shift, size, type Placement, type Strategy } from "@floating-ui/dom";
import { MACHINE_ENV } from "./env.js";

export type { Placement, Strategy };

/** The element a floating element is placed against: the element, the id of one in the same document, or nothing yet. */
export type PositionAnchor = HTMLElement | string | null | undefined;

/** Options for `usePosition`. `anchor` is required; placement, offset, flipping and shifting follow Floating UI's rules. */
export interface PositionOptions {
  /** The reference element (or its id). Read inside an effect, so a signal that supplies it re-positions. */
  anchor: () => PositionAnchor;
  /** Default `"bottom"`. */
  placement?: () => Placement;
  /** Main-axis gap in px. Default 0. */
  offset?: () => number;
  /** `"absolute"` (default) or `"fixed"`. */
  strategy?: () => Strategy;
  /** Flip to the opposite side when there is no room. Default true. */
  flip?: boolean;
  /** Shift along the axis to stay in the viewport. Default true. */
  shift?: boolean;
  /** Set `--anchor-width` (the reference's width) and `--available-height` on the floating element. Default false. */
  sameWidth?: boolean;
  /** Only position while open (so a hidden popover does no work). Default: always. */
  open?: () => boolean;
}

/** What `usePosition` returns: the placement actually used (after flipping) and a way to recompute on demand. */
export interface PositionHandle {
  /** The placement actually used after flipping. */
  readonly placement: ReadonlySignal<Placement>;
  /** Re-computes now (for content-size changes the observers cannot see). */
  update(): void;
}

/**
 * Places the host element next to an anchor with `@floating-ui/dom`: `position`, `left` and `top` styles and a
 * `data-placement` attribute. While the host is positioned it listens for scroll (the anchor's and the floating
 * element's ancestors), window resize and element resize (`autoUpdate`); those listeners are removed when
 * `open` turns false, when the anchor changes and when the owning scope is disposed. Call it during Setup.
 *
 * The host should be `position: absolute` (or fixed) with `width: max-content`; this function sets `position` and `left/top`.
 * Under a renderer that is not a DOM (the in-memory test renderer) it does nothing, and `placement` stays at its default.
 */
export function usePosition<N = unknown>(options: PositionOptions, target: { renderer: Renderer<N>; host: N } = injectHost<N>()): PositionHandle {
  const { renderer, host } = target;
  const env = inject(MACHINE_ENV, { optional: true });
  const isDom = !!host && (host as { nodeType?: number }).nodeType === 1 && typeof (host as { getRootNode?: unknown }).getRootNode === "function";
  const enabled = env?.effects ?? isDom;
  const placement = signal<Placement>("bottom");
  let stop: (() => void) | null = null;
  let current: (() => void) | null = null;
  const floating = host as unknown as HTMLElement;

  const resolve = (anchor: PositionAnchor): HTMLElement | null => {
    if (typeof anchor !== "string") return anchor ?? null;
    return (floating.ownerDocument.getElementById(anchor) as HTMLElement | null) ?? null;
  };

  const start = (reference: HTMLElement, cfg: { placement: Placement; offset: number; strategy: Strategy }) => {
    let alive = true;
    const update = async () => {
      const middleware = [offsetMiddleware(cfg.offset)];
      if (options.flip !== false) middleware.push(flip());
      if (options.shift !== false) middleware.push(shift({ padding: 4 }));
      if (options.sameWidth)
        middleware.push(
          size({
            apply({ rects, availableHeight }) {
              if (!alive) return;
              renderer.setStyle(host, "--anchor-width", `${rects.reference.width}px`);
              renderer.setStyle(host, "--available-height", `${availableHeight}px`);
            },
          }),
        );
      const result = await computePosition(reference, floating, { placement: cfg.placement, strategy: cfg.strategy, middleware });
      if (!alive) return; // disposed while computing
      renderer.setStyle(host, "position", cfg.strategy);
      renderer.setStyle(host, "left", `${result.x}px`);
      renderer.setStyle(host, "top", `${result.y}px`);
      renderer.setAttribute(host, "data-placement", result.placement);
      placement.set(result.placement);
    };
    const cleanup = autoUpdate(reference, floating, () => void update());
    current = () => void update();
    stop = () => {
      alive = false;
      stop = null;
      current = null;
      cleanup();
    };
  };

  effect(() => {
    const open = options.open ? options.open() : true;
    const reference = enabled ? resolve(options.anchor()) : null;
    const cfg = { placement: options.placement?.() ?? ("bottom" as Placement), offset: options.offset?.() ?? 0, strategy: options.strategy?.() ?? ("absolute" as Strategy) };
    untracked(() => {
      stop?.();
      if (enabled && open && reference) start(reference, cfg);
    });
  });
  currentScope()?.onDispose(() => untracked(() => stop?.()));
  return { placement, update: () => current?.() };
}

/**
 * `<div [uiPosition]="triggerId" placement="bottom-start" [offset]="8" [open]="open()">`: positions the element against
 * an anchor (an element or the id of one). Inputs are read reactively; see `usePosition` for the details.
 */
export class UiPosition {
  static meta = { selector: "[uiPosition]" };
  uiPosition = input<PositionAnchor>(null);
  placement = input<Placement>("bottom");
  offset = input<number>(0);
  strategy = input<Strategy>("absolute");
  open = input<boolean>(true);
  private _position = usePosition({
    anchor: () => this.uiPosition(),
    placement: () => this.placement(),
    offset: () => this.offset(),
    strategy: () => this.strategy(),
    open: () => this.open(),
  });
}
