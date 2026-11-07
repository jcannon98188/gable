import { describe, expect, it } from "vitest";
import { html, inject } from "@gable/core";
import { LiveAnnouncer } from "@gable/core/renderer";
import { RouterOutlet, type Route } from "@gable/core/router";
import { mountApp } from "@gable/testing";

class Home {
  static meta = { selector: "app-home", template: html`<h1>Home</h1>` };
}
class About {
  static meta = { selector: "app-about", template: html`<h1>About</h1><h2 id="sub">Sub</h2>` };
}
class Bare {
  static meta = { selector: "app-bare", template: html`<p>bare</p>` };
}
class Root {
  static meta = { selector: "app-root", imports: [RouterOutlet], template: html`<main><router-outlet></router-outlet></main>` };
  announcer = inject(LiveAnnouncer);
}

const routes: Route[] = [
  { path: "", component: Home, title: "Home page" },
  { path: "about", component: About, title: "About us" },
  { path: "custom", component: About, title: "Custom", announce: "Now on custom", focus: "#sub" },
  { path: "quiet", component: About, title: "Quiet", announce: false, focus: false },
  { path: "bare", component: Bare, title: "Bare" },
  { path: "notitle", component: About },
];

describe("LiveAnnouncer (in-memory)", () => {
  it("records polite and assertive announcements and ignores empty ones", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    app.announcer.announce("saved");
    app.announcer.announce("failed", "assertive");
    app.announcer.announce("");
    expect(app.announcer.messages).toEqual([
      { message: "saved", politeness: "polite" },
      { message: "failed", politeness: "assertive" },
    ]);
    expect(app.announcer.polite).toBe("saved");
    expect(app.announcer.assertive).toBe("failed");
    app.announcer.clear();
    expect(app.announcer.polite).toBe("");
  });
});

describe("router accessibility", () => {
  it("does not announce or move focus for the initial navigation", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    expect(app.announcer.messages).toEqual([]);
    expect(app.focus.focused).toBeNull();
  });

  it("announces the title and focuses the main heading after navigating", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    app.title.set("About us");
    await app.navigate("/about");
    expect(app.announcer.messages).toEqual([{ message: "About us", politeness: "polite" }]);
    expect(app.focus.focused?.tag).toBe("h1");
    expect(app.focus.focused?.attrs.tabindex).toBe("-1");
  });

  it("falls back to the router outlet when there is no heading", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    await app.navigate("/bare");
    expect(app.focus.focused?.tag).toBe("main");
  });

  it("route announce and focus override the global options", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    await app.navigate("/custom");
    expect(app.announcer.messages.at(-1)?.message).toBe("Now on custom");
    expect(app.focus.focused?.attrs.id).toBe("sub");
  });

  it("a route can opt out of both", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    await app.navigate("/quiet");
    expect(app.announcer.messages).toEqual([]);
    expect(app.focus.requests).toEqual([]);
  });

  it("does nothing for query or fragment changes on the same path", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    await app.navigate("/about");
    await app.navigate("/about?tab=2#x");
    expect(app.announcer.messages).toHaveLength(1);
    expect(app.focus.requests).toHaveLength(1);
  });

  it("announces on back navigation", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    await app.navigate("/about");
    app.history.back();
    await app.settle();
    expect(app.announcer.messages.map((m) => m.message)).toEqual(["About us", "Home page"]);
  });

  it("global options: announce function, politeness, focus, initial", async () => {
    const app = mountApp(Root, {
      routes,
      a11y: { announce: ({ title, url }) => `Navigated to ${title} (${url})`, politeness: "assertive", focus: ["#nope", "main"], initial: true },
    });
    await app.settle();
    expect(app.announcer.messages).toEqual([{ message: "Navigated to Home page (/)", politeness: "assertive" }]);
    expect(app.focus.focused?.tag).toBe("main");
  });

  it("announce: false and focus: false globally turn the feature off", async () => {
    const app = mountApp(Root, { routes, a11y: { announce: false, focus: false } });
    await app.settle();
    await app.navigate("/about");
    expect(app.announcer.messages).toEqual([]);
    expect(app.focus.requests).toEqual([]);
  });

  it("uses the platform title when the route has none", async () => {
    const app = mountApp(Root, { routes });
    await app.settle();
    app.title.set("Platform title");
    await app.navigate("/notitle");
    expect(app.announcer.messages.at(-1)?.message).toBe("Platform title");
  });
});
