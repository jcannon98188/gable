import { computed, effect, signal, untracked, type ReadonlySignal } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";

/** Options for `useCarousel`. `count` is required; every value is a getter so it may read signals. */
export interface CarouselOptions {
  /** How many slides there are. */
  count: () => number;
  /** Previous on the first slide goes to the last and next on the last to the first. Default false. */
  loop?: () => boolean;
  /** Milliseconds between slides; 0 or undefined turns autoplay off. */
  autoplay?: () => number | undefined;
  /** Selector (inside the host) of the scrolling viewport. Default `[data-carousel-viewport]`. */
  viewportSelector?: string;
  /** Selector (inside the viewport) of the slides. Default `[data-carousel-slide]`. */
  slideSelector?: string;
}

/** What `useCarousel` returns: the slide in view, autoplay state, and methods to move between slides. */
export interface CarouselHandle {
  /** The slide that is in view (0-based). */
  readonly index: ReadonlySignal<number>;
  /** The user's (or the `autoplay` option's) wish to autoplay. Toggled by `toggle()`. */
  readonly playing: ReadonlySignal<boolean>;
  /** True while a timer is really advancing slides: wanted, not paused by hover or keyboard focus, and motion is allowed. */
  readonly autoplaying: ReadonlySignal<boolean>;
  /** The user prefers reduced motion: autoplay never runs and scrolling is not smooth. */
  readonly reducedMotion: ReadonlySignal<boolean>;
  readonly canPrev: ReadonlySignal<boolean>;
  readonly canNext: ReadonlySignal<boolean>;
  goTo(index: number): void;
  prev(): void;
  next(): void;
  /** Start or stop autoplay (the pause button). */
  toggle(): void;
}

const SETTLE_MS = 700;

/**
 * Carousel behaviour over CSS scroll-snap: the viewport scrolls natively (touch, wheel, scrollbar) and snaps to
 * slides; this tracks which slide is in view, scrolls to a slide on request, handles Left/Right/Home/End from inside
 * the carousel, and runs an optional autoplay timer that pauses while the pointer is over the carousel or keyboard
 * focus is inside it, and never runs under `prefers-reduced-motion`.
 *
 * It finds the viewport and slides by selector under the host, so it is DOM only: under the in-memory renderer it
 * returns a handle that tracks `index` and the autoplay wish but touches nothing. Call it during Setup; timers and
 * listeners go with the scope. Horizontal, left-to-right.
 */
export function useCarousel(options: CarouselOptions, target: { renderer: Renderer<unknown>; host: unknown } = injectHost()): CarouselHandle {
  const host = target.host as HTMLElement;
  const dom = typeof host?.addEventListener === "function" && typeof host.querySelector === "function";
  const viewportSelector = options.viewportSelector ?? "[data-carousel-viewport]";
  const slideSelector = options.slideSelector ?? "[data-carousel-slide]";

  const position = signal(0);
  // A shrinking list can leave the position past the end.
  const index = computed(() => Math.min(position(), Math.max(0, options.count() - 1)));
  /** The user's override of the autoplay option (the pause button), or null to follow the option. */
  const override = signal<boolean | null>(null);
  const playing = computed(() => override() ?? !!options.autoplay?.());
  const hovered = signal(false);
  const focused = signal(false);
  const reducedMotion = signal(false);
  const loop = () => !!options.loop?.();

  const viewport = () => (dom ? host.querySelector<HTMLElement>(viewportSelector) : null);
  const slides = () => {
    const root = viewport();
    return root ? Array.from(root.querySelectorAll<HTMLElement>(slideSelector)) : [];
  };

  const last = () => Math.max(0, options.count() - 1);
  const clampIndex = (i: number) => Math.min(Math.max(0, i), last());

  // While we scroll to a slide ourselves, scroll events on the way must not move `index` through the slides between.
  let pending: { index: number; timer: ReturnType<typeof setTimeout> } | null = null;
  const endPending = () => {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  };

  const scrollToSlide = (i: number) => {
    const root = viewport();
    const slide = slides()[i];
    if (!root || !slide) return;
    const delta = slide.getBoundingClientRect().left - root.getBoundingClientRect().left;
    const left = root.scrollLeft + delta;
    const behavior = reducedMotion() ? "auto" : "smooth";
    if (typeof root.scrollTo === "function") root.scrollTo({ left, behavior });
    else root.scrollLeft = left;
  };

  const goTo = (i: number) => {
    const next = clampIndex(i);
    endPending();
    position.set(next);
    if (!dom) return;
    pending = { index: next, timer: setTimeout(endPending, SETTLE_MS) };
    scrollToSlide(next);
  };
  const prev = () => {
    const i = untracked(index);
    if (i > 0) goTo(i - 1);
    else if (loop()) goTo(last());
  };
  const next = () => {
    const i = untracked(index);
    if (i < last()) goTo(i + 1);
    else if (loop()) goTo(0);
  };

  const canPrev = computed(() => options.count() > 1 && (loop() || index() > 0));
  const canNext = computed(() => options.count() > 1 && (loop() || index() < options.count() - 1));
  const autoplaying = computed(() => !!options.autoplay?.() && playing() && !reducedMotion() && !hovered() && !focused() && options.count() > 1);

  if (dom) {
    const off: Array<() => void> = [];
    const listen = <K extends string>(el: EventTarget, type: K, handler: (event: any) => void, capture = false) => {
      el.addEventListener(type, handler, capture);
      off.push(() => el.removeEventListener(type, handler, capture));
    };

    // `scroll` does not bubble, but it can be captured on the host.
    listen(
      host,
      "scroll",
      (event: Event) => {
        const root = viewport();
        if (!root || event.target !== root) return;
        const all = slides();
        if (!all.length) return;
        const origin = root.getBoundingClientRect().left;
        let best = 0;
        let bestDistance = Infinity;
        all.forEach((slide, i) => {
          const distance = Math.abs(slide.getBoundingClientRect().left - origin);
          if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        });
        if (pending) {
          if (best !== pending.index) return;
          endPending();
        }
        if (best !== untracked(index)) position.set(clampIndex(best));
      },
      true,
    );

    listen(host, "keydown", (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (event.key === "ArrowLeft") prev();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "Home") goTo(0);
      else if (event.key === "End") goTo(last());
      else return;
      event.preventDefault();
    });

    listen(host, "mouseenter", () => hovered.set(true));
    listen(host, "mouseleave", () => hovered.set(false));
    listen(host, "focusin", (event: FocusEvent) => {
      // Only keyboard focus pauses: pressing the play button with the mouse must not stop the slides it just started.
      let visible = true;
      try {
        visible = (event.target as Element).matches(":focus-visible");
      } catch {
        // `:focus-visible` is not understood: treat every focus as keyboard focus.
      }
      if (visible) focused.set(true);
    });
    listen(host, "focusout", (event: FocusEvent) => {
      if (!event.relatedTarget || !host.contains(event.relatedTarget as Node)) focused.set(false);
    });

    const view = host.ownerDocument?.defaultView;
    const query = view?.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (query) {
      reducedMotion.set(query.matches);
      const onChange = (e: MediaQueryListEvent) => reducedMotion.set(e.matches);
      query.addEventListener?.("change", onChange);
      off.push(() => query.removeEventListener?.("change", onChange));
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    effect(() => {
      clearInterval(timer);
      timer = undefined;
      const ms = options.autoplay?.();
      if (!ms || ms <= 0 || !autoplaying()) return;
      timer = setInterval(() => {
        if (host.ownerDocument?.hidden) return;
        const i = untracked(index);
        goTo(i < last() ? i + 1 : 0);
      }, ms);
    });

    currentScope()?.onDispose(() => {
      clearInterval(timer);
      endPending();
      off.forEach((f) => f());
    });
  }

  return {
    index,
    playing,
    autoplaying,
    reducedMotion,
    canPrev,
    canNext,
    goTo,
    prev,
    next,
    toggle: () => override.set(!untracked(playing)),
  };
}
