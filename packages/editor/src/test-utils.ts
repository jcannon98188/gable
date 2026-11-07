// Helpers for the jsdom tests (`// @vitest-environment jsdom`). Not part of the package: excluded from the build.
import { afterEach, beforeEach, expect } from "vitest";
import { bootstrap, ErrorHandler, type Provider } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";

// jsdom has neither; Zag's positioning (Floating UI autoUpdate) observes with both.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
// jsdom does not implement element scrolling; Zag's select scrolls its list to the highlighted option.
for (const name of ["scrollTo", "scrollIntoView"] as const) (Element.prototype as unknown as Record<string, unknown>)[name] ??= () => {};
Object.assign(globalThis, { ResizeObserver: globalThis.ResizeObserver ?? NoopObserver, IntersectionObserver: globalThis.IntersectionObserver ?? NoopObserver });

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

export const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};

/** Call once at the top of a jsdom test file: a fresh body per test, per-task animation frames, and no unreported errors. */
export function useDomApp() {
  let destroy: () => void = () => {};
  const realRaf = globalThis.requestAnimationFrame;
  beforeEach(() => {
    // jsdom runs a frame's callbacks in one loop with no microtask checkpoint, and Zag chains frames: give each its own task.
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    Collector.reports.length = 0;
    document.body.replaceChildren();
    document.body.removeAttribute("style");
    document.body.removeAttribute("aria-hidden");
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = realRaf;
    destroy();
    destroy = () => {};
    expect(Collector.reports).toEqual([]);
  });
  return async function boot<T extends object>(Root: new () => T, providers: Provider[] = []): Promise<T> {
    const host = document.createElement("div");
    document.body.append(host);
    const ref = bootstrap(Root as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }, ...providers] }) as unknown as { instance: T; destroy(): void };
    destroy = () => ref.destroy();
    await settle();
    return ref.instance;
  };
}

export const $ = <E extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<E>(selector)!;
export const $$ = <E extends HTMLElement = HTMLElement>(selector: string) => [...document.querySelectorAll<E>(selector)];
export const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
/** jsdom has no PointerEvent: a MouseEvent of that type carries what Zag reads. */
export const pointer = (el: Element, type: string, init: MouseEventInit = {}) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return el.dispatchEvent(event);
};
