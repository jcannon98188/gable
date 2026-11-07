import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { RouterOutlet, provideRouteTransitions, type Route } from "@gable/core/router";
import { mountApp } from "./index.js";

class Home {
  static meta = { selector: "app-home", template: html`<h1>Home</h1>` };
}
class About {
  static meta = { selector: "app-about", template: html`<h1>About</h1>` };
}
const tpl = {
  plain: html`<router-outlet></router-outlet>`,
  css: html`<router-outlet transition></router-outlet>`,
  view: html`<router-outlet transition="view"></router-outlet>`,
};
const outlet = (kind: keyof typeof tpl = "plain") =>
  class Root {
    static meta = { selector: "app-root", imports: [RouterOutlet], template: tpl[kind] };
  };
const routes: Route[] = [
  { path: "", component: Home },
  { path: "about", component: About },
];
const animated = { exitDuration: () => 200 };

describe("route transitions (css)", () => {
  it("does nothing without opt-in: the old view is removed at once", async () => {
    const app = mountApp(outlet(), { routes, providers: [] });
    await app.settle();
    await app.navigate("/about");
    expect(app.queryAll("app-home")).toHaveLength(0);
    expect(app.query("app-about")!.attrs["data-state"]).toBeUndefined();
  });

  it("keeps the outgoing view, marked closed, until its animationend; the incoming view is open", async () => {
    const app = mountApp(outlet("css"), { routes, providers: provideRouteTransitions(animated) });
    await app.settle();
    const home = app.query("app-home")!;
    await app.navigate("/about");
    expect(app.query("app-about")!.attrs["data-state"]).toBe("open");
    expect(app.queryAll("app-home")).toHaveLength(1);
    expect(home.attrs["data-state"]).toBe("closed");
    expect(app.query("router-outlet")!.attrs["data-transition"]).toBe("css");
    app.dispatch(home, "animationend", { target: home });
    await app.settle();
    expect(app.queryAll("app-home")).toHaveLength(0);
    expect(app.queryAll("app-about")).toHaveLength(1);
  });

  it("removes the outgoing view when it has no exit animation", async () => {
    const app = mountApp(outlet("css"), { routes, providers: provideRouteTransitions({ exitDuration: () => null }) });
    await app.settle();
    await app.navigate("/about");
    await app.settle();
    expect(app.queryAll("app-home")).toHaveLength(0);
  });

  it("a route can opt in without a router-wide default", async () => {
    const perRoute: Route[] = [
      { path: "", component: Home },
      { path: "about", component: About, transition: true },
    ];
    const app = mountApp(outlet(), { routes: perRoute, providers: provideRouteTransitions({ ...animated, all: false }) });
    await app.settle();
    await app.navigate("/about");
    expect(app.queryAll("app-home")).toHaveLength(1);
  });

  it("a route can opt out of a router-wide default", async () => {
    const off: Route[] = [
      { path: "", component: Home },
      { path: "about", component: About, transition: false },
    ];
    const app = mountApp(outlet(), { routes: off, providers: provideRouteTransitions(animated) });
    await app.settle();
    await app.navigate("/about");
    expect(app.queryAll("app-home")).toHaveLength(0);
  });

  it("skips the animation under prefers-reduced-motion", async () => {
    const app = mountApp(outlet("css"), { routes, providers: provideRouteTransitions({ ...animated, reducedMotion: () => true }) });
    await app.settle();
    await app.navigate("/about");
    expect(app.queryAll("app-home")).toHaveLength(0);
    expect(app.query("app-about")!.attrs["data-state"]).toBeUndefined();
  });
});

describe("route transitions (view)", () => {
  it("runs the swap inside startViewTransition when available", async () => {
    let pending: (() => void) | null = null;
    const app = mountApp(outlet("view"), {
      routes,
      providers: provideRouteTransitions({ startViewTransition: (update) => ((pending = update), true) }),
    });
    await app.settle();
    expect(app.text()).toBe("Home");
    await app.navigate("/about");
    expect(app.text()).toBe("Home"); // old view stays until the browser has captured it
    pending!();
    expect(app.text()).toBe("About");
  });

  it("falls back to an immediate swap when the API is missing", async () => {
    const app = mountApp(outlet("view"), { routes, providers: provideRouteTransitions({ startViewTransition: () => false }) });
    await app.settle();
    await app.navigate("/about");
    expect(app.text()).toBe("About");
  });

  it("skips the transition under reduced motion", async () => {
    let called = 0;
    const app = mountApp(outlet("view"), {
      routes,
      providers: provideRouteTransitions({ reducedMotion: () => true, startViewTransition: () => (called++, true) }),
    });
    await app.settle();
    await app.navigate("/about");
    expect(called).toBe(0);
    expect(app.text()).toBe("About");
  });
});
