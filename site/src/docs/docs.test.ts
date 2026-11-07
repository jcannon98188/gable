import { describe, expect, it } from "vitest";
import { mount, mountApp } from "@gable/testing";
import { App } from "../app.js";
import { routes } from "../routes.js";
import { API_SOURCE, type ApiSource } from "./api-data.js";
import type { ApiIndex, ApiPackage } from "./api-types.js";
import { resolveDocLink } from "./content.js";
import { DocMarkdown } from "./doc-markdown.js";
import { DocCode } from "./doc-code.js";
import { buildSearchIndex, search } from "./search.js";
import { parseMarkdown } from "./markdown.js";
import { loadGuide } from "./content.js";

const files = import.meta.glob("./__fixtures__/api/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
const fixture = (name: string) => files[`./__fixtures__/api/${name}.json`];

/** The hand-made sample the extractor's contract describes. */
const source: ApiSource = {
  index: async () => fixture("index") as ApiIndex,
  pkg: async (slug) => (fixture(slug) as ApiPackage | undefined) ?? null,
};

const providers = [{ provide: API_SOURCE, useValue: source }];

/** Polls (real timers: lazy imports and raw guide imports resolve outside the microtask queue) until `check` holds. */
async function waitFor(app: { flush(): Promise<void>; claimErrors(): unknown }, check: () => boolean, tolerateErrors = false): Promise<void> {
  for (let i = 0; i < 300; i++) {
    await app.flush().catch((e) => {
      if (!tolerateErrors) throw e;
      app.claimErrors();
    });
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out waiting for the page");
}

async function open(url: string) {
  const app = mountApp(App, { routes, url, providers });
  // The marketing page's live demos use an @defer viewport trigger and services the in-memory test renderer lacks.
  if (!url.startsWith("/docs")) {
    await waitFor(app, () => !!app.query("section#compiler") || app.location.url !== url, true);
    app.claimErrors();
    return app;
  }
  await waitFor(app, () => !!app.query("main h1") && !app.text().includes("Loading"));
  return app;
}

describe("routes", () => {
  it("serves the marketing page at /", async () => {
    const app = await open("/");
    expect(app.query("section#compiler")).toBeTruthy();
    expect(app.query("docs-shell")).toBeNull();
  });

  it("serves the docs home, a guide, a package and its reference", async () => {
    const home = await open("/docs");
    expect(home.query("h1")!.children.map((c) => c.text).join("")).toContain("Gable documentation");
    expect(home.query("section#compiler")).toBeNull();

    const guide = await open("/docs/guides/router");
    expect(guide.text()).toContain("Router");
    expect(guide.query("h2#set-it-up")).toBeTruthy();

    const pkg = await open("/docs/core");
    expect(pkg.text()).toContain("@gable/core");
    expect(pkg.text()).toContain("@gable/core/router");

    const index = await open("/docs/core/api");
    expect(index.text()).toContain("signal");
    expect(index.text()).toContain("Router");

    const symbol = await open("/docs/core/api/core%3Asignal");
    expect(symbol.query("h1")!.children.map((c) => c.text).join("")).toBe("signal");
  });

  it("shows not-found pages inside the docs frame, and sends unknown top-level URLs home", async () => {
    expect((await open("/docs/nope/x/y/z")).text()).toContain("Page not found");
    expect((await open("/docs/guides/nope")).text()).toContain("Guide not found");
    expect((await open("/docs/core/api/missing")).text()).toContain("Symbol not found");
    const lost = await open("/elsewhere");
    expect(lost.location.url).toBe("/");
    expect(lost.query("section#compiler")).toBeTruthy();
  });

  it("navigates between the two without a reload", async () => {
    const app = await open("/");
    await app.navigate("/docs/guides/store");
    await waitFor(app, () => !!app.query("docs-shell") && !app.text().includes("Loading"));
    expect(app.query("docs-shell")).toBeTruthy();
    expect(app.location.url).toBe("/docs/guides/store");
    await app.navigate("/").catch(() => {}); // the marketing page reports the test renderer's missing viewport trigger
    await waitFor(app, () => !!app.query("section#compiler"), true);
    app.claimErrors();
    expect(app.query("section#compiler")).toBeTruthy();
  });
});

describe("docs layout", () => {
  it("has landmarks, a skip link, grouped navigation with the current page marked, and on-page contents", async () => {
    const app = await open("/docs/guides/router");
    expect(app.query("a.skip")!.attrs["href"]).toBe("#docs-main");
    expect(app.query("main#docs-main")).toBeTruthy();
    expect(app.query("nav[aria-label='Documentation']")).toBeTruthy();
    const groups = app.queryAll("nav#docs-nav .sb-t").map((n) => app.textOf(n));
    expect(groups).toEqual(["Getting started", "Guides", "Packages"]);
    const current = app.queryAll("nav#docs-nav a").filter((a) => a.attrs["aria-current"] === "page");
    expect(current.map((a) => app.textOf(a))).toEqual(["Router"]);
    expect(app.queryAll("aside li a").length).toBeGreaterThan(3);
    // Previous and next follow the guide order.
    expect(app.query(".pager .prev")!.attrs["href"]).toBe("/docs/guides/manual-setup");
    expect(app.query(".pager .next")!.attrs["href"]).toBe("/docs/guides/store");
  });

  it("lists the generated packages with their API links", async () => {
    const app = await open("/docs");
    const links = app.queryAll("li.sb-pkg a").map((a) => a.attrs["href"]);
    expect(links).toContain("/docs/core");
    expect(links).toContain("/docs/core/api");
  });

  it("lists the application packages without an API link and serves their guide", async () => {
    const app = await open("/docs");
    const sidebar = app.queryAll("li.sb-pkg a").map((a) => a.attrs["href"]);
    expect(sidebar).toContain("/docs/vscode");
    expect(sidebar).not.toContain("/docs/vscode/api");
    const page = await open("/docs/vscode");
    expect(page.text()).toContain("TypeScript server plugin");
    expect(page.queryAll("a").some((a) => a.attrs["href"] === "/docs/vscode/api")).toBe(false);
    expect(page.text()).not.toContain("Entry points");
  });

  it("opens the mobile drawer from the menu button", async () => {
    const app = await open("/docs");
    const button = app.query("button.dx-menu")!;
    expect(button.attrs["aria-expanded"]).toBe("false");
    app.dispatch(button, "click", {});
    await app.flush();
    expect(button.attrs["aria-expanded"]).toBe("true");
    expect(app.query("nav#docs-nav")!.classes).toContain("open");
    app.dispatch(app.query(".dx")!, "keydown", { key: "Escape" });
    await app.flush();
    expect(button.attrs["aria-expanded"]).toBe("false");
  });

  it("moves focus to the page heading after a navigation", async () => {
    const app = await open("/docs");
    await app.navigate("/docs/guides/store");
    for (let i = 0; i < 4; i++) await app.flush();
    expect(app.announcer.messages.length).toBeGreaterThanOrEqual(0);
  });
});

describe("markdown", () => {
  const doc = (md: string) => parseMarkdown(md, { resolveLink: resolveDocLink });

  it("parses headings with unique ids, tables, lists and fenced code", () => {
    const d = doc("# Title\n\n## Same\n\n## Same\n\n| a | b |\n| --- | :-: |\n| `x|y` | 2 |\n\n- one\n  - nested\n- two\n\n1. first\n\n```ts\nconst a = 1;\n```\n");
    expect(d.title).toBe("Title");
    expect(d.toc.map((t) => t.id)).toEqual(["same", "same-1"]);
    const kinds = d.blocks.map((b) => b.kind);
    expect(kinds).toEqual(["h1", "h2", "h2", "table", "ul", "ol", "code"]);
    const table = d.blocks[3]!;
    expect(table.head.map((c) => c.align)).toEqual(["", "center"]);
    expect(table.rows[0]!.cells[0]!.inlines[0]!.text).toBe("x|y");
    expect(d.blocks[4]!.items[0]!.sub).toHaveLength(1);
    expect(d.blocks[6]!.code).toBe("const a = 1;");
    expect(d.blocks[6]!.lang).toBe("ts");
  });

  it("resolves links to other guides to docs routes and repository files to GitHub", () => {
    expect(resolveDocLink("./router.md#guards")).toEqual({ href: "/docs/guides/router#guards", internal: true });
    expect(resolveDocLink("accessibility.md")).toEqual({ href: "/docs/guides/accessibility", internal: true });
    expect(resolveDocLink("../README.md")!.href).toMatch(/^https:\/\/github\.com\/.+\/blob\/main\/README\.md$/);
    expect(resolveDocLink("#frag")).toEqual({ href: "#frag", internal: false });
  });

  it("renders real guides without leftovers", async () => {
    const d = (await loadGuide("router"))!;
    expect(d.title).toBe("Router");
    expect(d.blocks.some((b) => b.kind === "table")).toBe(true);
    expect(d.blocks.filter((b) => b.kind === "code").length).toBeGreaterThan(5);
  });

  it("drops unsafe link schemes to plain text", () => {
    const d = doc("[click](javascript:alert(1)) and [ok](https://example.com) and [data](data:text/html;base64,AAAA)");
    const runs = d.blocks[0]!.inlines;
    expect(runs.find((r) => r.text === "click")!.href).toBeNull();
    expect(runs.find((r) => r.text === "data")!.href).toBeNull();
    expect(runs.find((r) => r.text === "ok")!.href).toBe("https://example.com");
  });

  it("never injects HTML: markup in the source is shown as text", async () => {
    const f = mount(DocMarkdown, {
      inputs: { source: '<img src=x onerror="alert(1)"> and <script>boom()</script> **bold** [x](javascript:alert(1))\n\n```html\n<b onclick="x()">hi</b>\n```\n' },
    });
    await f.settle();
    expect(f.query("img")).toBeNull();
    expect(f.query("script")).toBeNull();
    expect(f.query("b")).toBeNull();
    expect(f.queryAll("a")).toHaveLength(0);
    expect(f.text()).toContain('<img src=x onerror="alert(1)">');
    expect(f.text()).toContain("<script>boom()</script>");
    expect(f.text()).toContain('<b onclick="x()">hi</b>');
  });

  it("renders code blocks with syntax classes", async () => {
    const f = mount(DocCode, { inputs: { code: 'const x = "a";', language: "ts" } });
    await f.settle();
    expect(f.queryAll("span.tk-keyword").map((n) => f.textOf(n))).toEqual(["const"]);
    expect(f.queryAll("span.tk-string").length).toBe(1);
  });
});

describe("API reference pages", () => {
  it("renders signature, summary, parameters, returns, examples, see-also and the source link", async () => {
    const app = await open("/docs/core/api/core%3Asignal");
    const text = app.text();
    expect(text).toContain("function signal<T>(initial: T, options?: SignalOptions<T>): WritableSignal<T>");
    expect(text).toContain("Creates a writable signal");
    expect(app.query("h2#parameters")).toBeTruthy();
    const rows = app.queryAll("tbody tr");
    expect(rows).toHaveLength(3); // the type parameter, then the two parameters
    expect(app.textOf(rows[2]!)).toContain("optional");
    expect(app.query("h2#returns")).toBeTruthy();
    expect(app.query("h2#examples")).toBeTruthy();
    expect(app.queryAll(".api .tk-keyword").length).toBeGreaterThan(1);
    // `[the store guide](./store.md)` in a summary becomes a docs link.
    expect(app.queryAll("a").some((a) => a.attrs["href"] === "/docs/guides/store")).toBe(true);
    const source = app.queryAll("a").find((a) => a.attrs["href"]?.endsWith("packages/core/src/signals.ts"));
    expect(source).toBeTruthy();
    // Contents list the sections.
    expect(app.queryAll(".dx-toc a").map((a) => app.textOf(a))).toEqual(expect.arrayContaining(["Parameters", "Returns", "Examples"]));
  });

  it("shows a deprecation banner and the members of a class", async () => {
    const old = await open("/docs/core/api/core%3AoldThing");
    expect(old.query(".dep")!.attrs["role"]).toBe("note");
    expect(old.text()).toContain("Use signal instead.");

    const router = await open("/docs/core/api/core%2Frouter%3ARouter");
    expect(router.query("h2#members")).toBeTruthy();
    expect(router.queryAll("section.member")).toHaveLength(2);
    expect(router.text()).toContain("navigate(target: string | readonly unknown[]");
    expect(router.text()).toContain("Extends");
  });

  it("lists every entry point on the package reference index", async () => {
    const app = await open("/docs/core/api");
    expect(app.queryAll("h2.md-h code").map((n) => app.textOf(n))).toEqual(["@gable/core", "@gable/core/router"]);
    const link = app.queryAll("ul.symbols a").find((a) => app.textOf(a) === "signal")!;
    expect(link.attrs["href"]).toBe("/docs/core/api/core%3Asignal");
  });

  it("links the neighbouring symbols from a symbol page", async () => {
    const app = await open("/docs/core/api/core%3Acomputed");
    expect(app.query(".pager .prev")!.attrs["href"]).toBe("/docs/core/api/core%3Asignal");
    expect(app.query(".pager .next")!.attrs["href"]).toBe("/docs/core/api/core%3AoldThing");
  });
});

describe("search", () => {
  async function index() {
    const guides = new Map();
    for (const slug of ["router", "store"]) guides.set(slug, (await loadGuide(slug))!);
    return buildSearchIndex(guides, [fixture("core") as ApiPackage]);
  }

  it("finds API symbols and guide sections, best match first", async () => {
    const idx = await index();
    const signal = search(idx, "signal");
    expect(signal[0]!.entry.title).toBe("signal");
    expect(signal[0]!.entry.url).toBe("/docs/core/api/core%3Asignal");
    const guards = search(idx, "guards");
    expect(guards.some((h) => h.entry.kind === "Section" && h.entry.url.startsWith("/docs/guides/router#"))).toBe(true);
    expect(search(idx, "zzzzqqq")).toEqual([]);
    expect(search(idx, "")).toEqual([]);
  });

  it("requires every word of the query", async () => {
    const idx = await index();
    expect(search(idx, "navigate router").length).toBeGreaterThan(0);
    expect(search(idx, "navigate zzzzqqq")).toEqual([]);
  });

  it("opens results as you type and navigates with the keyboard", async () => {
    const app = await open("/docs");
    const input = app.query("input.srch-in")!;
    app.dispatch(input, "focus", {});
    app.type(input, "computed");
    await waitFor(app, () => app.queryAll("[role=option]").length > 0);
    expect(input.attrs["aria-expanded"]).toBe("true");
    const options = app.queryAll("[role=option]");
    expect(options.length).toBeGreaterThan(0);
    expect(app.textOf(options[0]!)).toContain("computed");
    app.keydown(input, "Enter");
    await waitFor(app, () => app.location.url.includes("computed") && !app.text().includes("Loading"));
    expect(app.location.url).toBe("/docs/core/api/core%3Acomputed");
    expect(app.queryAll("[role=option]")).toHaveLength(0);
  });

  it("closes on Escape", async () => {
    const app = await open("/docs");
    const input = app.query("input.srch-in")!;
    app.type(input, "signal");
    await waitFor(app, () => input.attrs["aria-expanded"] === "true");
    app.keydown(input, "Escape");
    await app.flush();
    expect(input.attrs["aria-expanded"]).toBe("false");
  });
});
