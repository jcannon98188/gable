// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, inject } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { LiveAnnouncer } from "@gable/core/renderer";
import { Router, RouterOutlet, provideRouter, type Route } from "@gable/core/router";
import { dom } from "./index.js";

class Home {
  static meta = { selector: "app-home", template: html`<h1>Home</h1>` };
}
class About {
  static meta = { selector: "app-about", template: html`<h1>About</h1><p id="p">text</p>` };
}
class Root {
  static meta = { selector: "app-root", imports: [RouterOutlet], template: html`<main><router-outlet></router-outlet></main>` };
  announcer = inject(LiveAnnouncer);
  router = inject(Router);
}

const routes: Route[] = [
  { path: "", component: Home, title: "Home" },
  { path: "about", component: About, title: "About us" },
  { path: "p", component: About, focus: "#p", announce: "Paragraph page" },
];

function start(options: { overlay?: boolean } = {}) {
  window.history.replaceState(null, "", "/");
  const host = document.createElement("div");
  const overlay = document.createElement("div");
  document.body.replaceChildren(host, overlay);
  let app!: Root;
  const ref = bootstrap(Root, { renderer: dom(options.overlay ? { overlayRoot: overlay } : {}), target: host, providers: provideRouter(routes) });
  app = ref.instance;
  return { host, overlay, get app() { return app; } };
}

const region = (politeness: string) => document.querySelector<HTMLElement>(`[data-gable-live="${politeness}"]`)!;

beforeEach(() => void (document.body.innerHTML = ""));

describe("LiveAnnouncer (jsdom)", () => {
  it("creates polite and assertive live regions in document.body", async () => {
    const t = start();
    await whenFlushed();
    expect(region("polite").getAttribute("role")).toBe("status");
    expect(region("polite").getAttribute("aria-live")).toBe("polite");
    expect(region("assertive").getAttribute("role")).toBe("alert");
    expect(region("assertive").getAttribute("aria-live")).toBe("assertive");
    expect(region("polite").parentElement).toBe(document.body);
    t.app.announcer.announce("Saved");
    t.app.announcer.announce("Failed", "assertive");
    expect(region("polite").textContent?.trim()).toBe("Saved");
    expect(region("assertive").textContent?.trim()).toBe("Failed");
    t.app.announcer.clear();
    expect(region("polite").textContent).toBe("");
  });

  it("puts the regions in the overlay root when one is configured", async () => {
    const t = start({ overlay: true });
    await whenFlushed();
    expect(region("polite").parentElement).toBe(t.overlay);
  });

  it("makes a repeated message a text change", async () => {
    const t = start();
    await whenFlushed();
    t.app.announcer.announce("Same");
    const first = region("polite").textContent;
    t.app.announcer.announce("Same");
    expect(region("polite").textContent).not.toBe(first);
  });
});

describe("router accessibility (jsdom)", () => {
  it("announces and focuses the new page's heading, making it focusable", async () => {
    const t = start();
    await t.app.router.whenIdle();
    await whenFlushed();
    expect(document.activeElement).toBe(document.body);
    await t.app.router.navigate("/about");
    await whenFlushed();
    expect(region("polite").textContent?.trim()).toBe("About us");
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("honours a per-route focus target and message", async () => {
    const t = start();
    await t.app.router.whenIdle();
    await t.app.router.navigate("/p");
    await whenFlushed();
    expect(document.activeElement?.id).toBe("p");
    expect(region("polite").textContent?.trim()).toBe("Paragraph page");
  });
});
