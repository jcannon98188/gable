// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ComponentClass, bootstrap, html, inject } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { Router, RouterOutlet, provideRouter, provideRouteTransitions, type Route } from "@gable/core/router";
import { dom } from "./index.js";

class Home {
  static meta = { selector: "app-home", template: html`<h1>Home</h1>` };
}
class About {
  static meta = { selector: "app-about", template: html`<h1>About</h1>` };
}
class Root {
  static meta = { selector: "app-root", imports: [RouterOutlet], template: html`<router-outlet transition></router-outlet>` };
  router = inject(Router);
}
class ViewRoot {
  static meta = { selector: "app-root", imports: [RouterOutlet], template: html`<router-outlet transition="view"></router-outlet>` };
  router = inject(Router);
}
const routes: Route[] = [
  { path: "", component: Home },
  { path: "about", component: About },
];

let apps: Array<{ destroy(): void }> = [];
function start(Component: ComponentClass<{ router: Router }>, extra = provideRouteTransitions({ all: false })) {
  window.history.replaceState(null, "", "/");
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  const ref = bootstrap(Component, { renderer: dom(), target: host, providers: [...provideRouter(routes), ...extra] });
  apps.push(ref);
  return { host, router: ref.instance.router };
}
const ready = async (router: Router) => {
  await router.whenIdle();
  await whenFlushed();
};
const go = async (router: Router, url: string) => {
  await router.navigate(url);
  await whenFlushed();
};

beforeEach(() => {
  document.head.innerHTML = "<style>app-home[data-state=closed]{animation:out 300ms}</style>";
});
afterEach(() => {
  apps.forEach((a) => a.destroy());
  apps = [];
  vi.useRealTimers();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});

describe("route transitions (jsdom)", () => {
  it("keeps the outgoing view while its CSS animation runs, then removes it on animationend", async () => {
    const { host, router } = start(Root);
    await ready(router);
    const home = host.querySelector("app-home")!;
    await go(router, "/about");
    expect(host.querySelector("router-outlet")!.getAttribute("data-transition")).toBe("css");
    expect(home.getAttribute("data-state")).toBe("closed");
    expect(host.querySelector("app-about")!.getAttribute("data-state")).toBe("open");
    expect(host.contains(home)).toBe(true);
    home.dispatchEvent(new Event("animationend"));
    await new Promise((r) => setTimeout(r, 0));
    expect(host.contains(home)).toBe(false);
    expect(host.querySelectorAll("app-about")).toHaveLength(1);
  });

  it("removes the outgoing view after the timeout when the animation never reports an end", async () => {
    const { host, router } = start(Root);
    await ready(router);
    const home = host.querySelector("app-home")!;
    vi.useFakeTimers();
    await go(router, "/about");
    expect(host.contains(home)).toBe(true);
    await vi.advanceTimersByTimeAsync(450);
    expect(host.contains(home)).toBe(false);
  });

  it("swaps at once under prefers-reduced-motion", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce") })) as never;
    try {
      const { host, router } = start(Root);
      await ready(router);
      await go(router, "/about");
      expect(host.querySelector("app-home")).toBeNull();
      expect(host.querySelector("app-about")!.hasAttribute("data-state")).toBe(false);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it("uses document.startViewTransition when it exists", async () => {
    const calls: Array<() => void> = [];
    (document as { startViewTransition?: unknown }).startViewTransition = (cb: () => void) => void calls.push(cb);
    const { host, router } = start(ViewRoot);
    await ready(router);
    expect(host.querySelector("app-home")).not.toBeNull();
    await go(router, "/about");
    expect(host.querySelector("app-home")).not.toBeNull();
    calls.shift()!();
    expect(host.querySelector("app-home")).toBeNull();
    expect(host.querySelector("app-about")).not.toBeNull();
  });

  it("falls back to a plain swap when the View Transitions API is missing", async () => {
    const { host, router } = start(ViewRoot);
    await ready(router);
    await go(router, "/about");
    expect(host.querySelector("app-home")).toBeNull();
    expect(host.querySelector("app-about")).not.toBeNull();
  });
});
