// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal, type ComponentClass } from "@gable/core";
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { DEMOS, demoByName, type DemoEntry } from "./demos.js";
import { DocDemo } from "./doc-demo.js";
import { DocMarkdown } from "./doc-markdown.js";
import { loadPackageGuide, packageGuideSlugs, resolveDocLink } from "./content.js";
import { buildSearchIndex, search } from "./search.js";
import { parseMarkdown } from "./markdown.js";
import type { ApiPackage } from "./api-types.js";

const registry = DEMOS as Record<string, DemoEntry>;

class Hello {
  static meta = { selector: "t-hello", template: html`<p class="hello">Hello {{ who() }}</p>` };
  who = signal("demo");
}

registry["t-ok"] = { title: "OK demo", description: "Works.", load: async () => Hello as ComponentClass, source: async () => "export class Hello {}" };
registry["t-bad"] = { title: "Bad demo", description: "Fails to load.", load: () => Promise.reject(new Error("chunk 404")), source: async () => "// broken" };
let attempts = 0;
registry["t-flaky"] = {
  title: "Flaky demo",
  description: "Fails once.",
  load: async () => {
    if (++attempts === 1) throw new Error("network down");
    return Hello as ComponentClass;
  },
  source: async () => "",
};

/** Mounts a component on the real DOM renderer and returns its root element. */
function open(Root: ComponentClass) {
  const root = document.createElement("div");
  document.body.append(root);
  bootstrap(Root, { renderer: dom(), target: root });
  return root;
}
function page(source: string): ComponentClass {
  class Host {
    static meta = { selector: "t-host", imports: [DocMarkdown], template: html`<doc-markdown [source]="src"></doc-markdown>` };
    src = source;
  }
  return Host;
}
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("timed out");
}

describe("demo fences", () => {
  it("parses `demo <name>` into a demo block with the body as caption", () => {
    const d = parseMarkdown("# T\n\n```demo signals\nA caption.\n```\n\nafter\n\n```ts\ncode\n```\n\n```demo\nno name\n```\n");
    expect(d.blocks.map((b) => b.kind)).toEqual(["h1", "demo", "p", "code", "code"]);
    expect(d.blocks[1]).toMatchObject({ lang: "signals", code: "A caption." });
    expect(d.blocks[4]!.lang).toBe("demo");
  });

  it("registers every named built-in demo", () => {
    for (const name of ["signals", "expressions", "rxjs", "router", "forms", "i18n", "store"]) {
      expect(demoByName(name), name).toBeTruthy();
    }
    expect(demoByName("toString")).toBeUndefined();
  });

  it("reads each built-in demo's real source", async () => {
    const src = await DEMOS["signals"]!.source();
    expect(src).toContain("class SignalsDemo");
  });
});

describe("DocDemo", () => {
  it("mounts a registered demo with its title and source", async () => {
    const el = open(page(["```demo t-ok", "A caption.", "```"].join("\n")));
    await until(() => !!el.querySelector("p.hello") && !!el.querySelector("details"));
    expect(el.textContent).toContain("OK demo");
    expect(el.textContent).toContain("A caption.");
    expect(el.textContent).toContain("Hello demo");
    expect(el.querySelector("details doc-code")).toBeTruthy();
    expect(el.textContent).not.toContain("failed to load");
  });

  it("shows the failure inline when the demo cannot load, and the rest of the page keeps working", async () => {
    const el = open(page(["# Page", "", "Before.", "", "```demo t-bad", "```", "", "After the demo.", "", "```demo t-ok", "```", ""].join("\n")));
    await until(() => !!el.textContent?.includes("failed to load") && !!el.querySelector("p.hello"));
    expect(el.textContent).toContain("This demo failed to load.");
    expect(el.textContent).toContain("chunk 404");
    expect(el.textContent).toContain("Before.");
    expect(el.textContent).toContain("After the demo.");
    expect(el.querySelector("button.retry")).toBeTruthy();
    expect(el.textContent).toContain("Hello demo");
  });

  it("reports an unknown demo name the same way", async () => {
    const el = open(page(["```demo nope", "```"].join("\n")));
    await until(() => !!el.textContent?.includes("failed to load"));
    expect(el.textContent).toContain('No demo named "nope"');
  });

  it("retries from scratch", async () => {
    const el = open(page(["```demo t-flaky", "```"].join("\n")));
    await until(() => !!el.textContent?.includes("network down"));
    el.querySelector<HTMLButtonElement>("button.retry")!.click();
    await until(() => !!el.querySelector("p.hello"));
    expect(el.textContent).not.toContain("failed to load");
    expect(attempts).toBe(2);
  });
});

describe("package guides", () => {
  it("loads docs/packages/<slug>.md and returns null for a package without one", async () => {
    expect(packageGuideSlugs()).toContain("core");
    const doc = await loadPackageGuide("core");
    expect(doc!.title).toBe("@gable/core");
    expect(doc!.blocks.some((b) => b.kind === "demo" && b.lang === "signals")).toBe(true);
    expect(await loadPackageGuide("no-such-package")).toBeNull();
  });

  it("resolves relative links from docs/packages", () => {
    expect(resolveDocLink("../router.md#guards", "docs/packages")).toEqual({ href: "/docs/guides/router#guards", internal: true });
    expect(resolveDocLink("./store.md", "docs/packages")).toEqual({ href: "/docs/store", internal: true });
  });

  it("includes package guides in search", async () => {
    const guide = (await loadPackageGuide("core"))!;
    const pkg = { name: "@gable/core", slug: "core", description: "", entryPoints: [] } as unknown as ApiPackage;
    const idx = buildSearchIndex(new Map(), [pkg], new Map([["core", guide]]));
    const hits = search(idx, "decorators");
    expect(hits[0]!.entry.url).toBe("/docs/core");
    const section = search(idx, "install");
    expect(section.some((h) => h.entry.url === "/docs/core#install")).toBe(true);
  });
});
