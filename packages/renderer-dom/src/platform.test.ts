// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, inject } from "@gable/core";
import { History, Location, Title } from "@gable/core/renderer";
import { dom, type DomRendererOptions } from "./index.js";
import { createDomPlatform } from "./platform.js";

interface Services {
  location: Location;
  history: History;
  title: Title;
}

function start(options: DomRendererOptions = {}): Services {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  let services!: Services;
  class App {
    static meta = { selector: "app-root", template: html`<p>hi</p>` };
    location = inject(Location);
    history = inject(History);
    title = inject(Title);
    ref = (services = this as unknown as Services);
  }
  bootstrap(App, { renderer: dom(options), target: host });
  return services;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  document.title = "";
});

describe("DOM platform services", () => {
  it("bootstrap(dom()) provides Location, History and Title with no extra providers", () => {
    const s = start();
    expect(s.location.href).toBe("/");
  });

  it("History.push and replace change the real URL and Location reads it", () => {
    const s = start();
    s.history.push("/users/4?tab=a#top", { n: 1 });
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/users/4?tab=a#top");
    expect([s.location.href, s.location.pathname, s.location.search, s.location.hash]).toEqual(["/users/4?tab=a#top", "/users/4", "?tab=a", "#top"]);
    expect(s.history.state).toEqual({ n: 1 });
    s.history.replace("/users/5");
    expect(window.location.pathname).toBe("/users/5");
    expect(window.history.length).toBeGreaterThan(0);
  });

  it("Location.subscribe fires on back and forward, not on the app's own pushes", async () => {
    const s = start();
    const seen: string[] = [];
    const off = s.location.subscribe((href) => seen.push(href));
    s.history.push("/a");
    s.history.push("/b");
    expect(seen).toEqual([]);
    s.history.back();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(["/a"]);
    off();
    s.history.back();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(["/a"]);
  });

  it("Title reads and writes document.title", () => {
    const s = start();
    s.title.set("Inbox");
    expect(document.title).toBe("Inbox");
    expect(s.title.get()).toBe("Inbox");
  });

  it("a base path is removed from reads and added to writes", () => {
    window.history.replaceState(null, "", "/app/users");
    const s = start({ base: "/app" });
    expect(s.location.pathname).toBe("/users");
    s.history.push("/orders?x=1");
    expect(window.location.pathname + window.location.search).toBe("/app/orders?x=1");
    expect(s.location.href).toBe("/orders?x=1");
  });

  it("hash mode keeps the app URL after the #", () => {
    window.history.replaceState(null, "", "/index.html#/users?tab=a");
    const s = start({ mode: "hash" });
    expect([s.location.pathname, s.location.search]).toEqual(["/users", "?tab=a"]);
    s.history.push("/orders");
    expect(window.location.pathname + window.location.hash).toBe("/index.html#/orders");
    expect(s.location.href).toBe("/orders");
  });
});

describe("Meta over document.head", () => {
  const meta = () => createDomPlatform().meta;
  afterEach(() => {
    document.head.querySelectorAll("meta,link").forEach((e) => e.remove());
  });

  it("creates meta, property and link tags, and removes them on reset", () => {
    const m = meta();
    m.set({ description: "d", themeColor: "#fff", canonical: "https://x.test/a", og: { title: "T" }, twitter: { card: "summary" } });
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("d");
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#fff");
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe("T");
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe("summary");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://x.test/a");
    m.set({ description: "e" });
    expect(document.head.querySelectorAll("meta").length).toBe(1);
    expect(document.head.querySelector("link")).toBeNull();
    m.clear();
    expect(document.head.querySelector("meta")).toBeNull();
  });

  it("adopts a tag the page already has and restores it", () => {
    document.head.innerHTML = '<meta name="description" content="static">';
    const m = meta();
    m.set({ description: "route" });
    expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);
    expect(document.head.querySelector("meta")?.getAttribute("content")).toBe("route");
    m.set({});
    expect(document.head.querySelector("meta")?.getAttribute("content")).toBe("static");
  });

  it("update merges", () => {
    const m = meta();
    m.set({ og: { title: "a" } });
    m.update({ og: { description: "b" }, robots: "noindex" });
    expect(m.get()).toEqual({ og: { title: "a", description: "b" }, robots: "noindex" });
    expect(document.head.querySelectorAll("meta").length).toBe(3);
  });
});
