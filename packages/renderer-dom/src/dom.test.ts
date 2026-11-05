// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap, ErrorHandler, html, signal } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "./index.js";

beforeEach(() => {
  reported.length = 0;
  document.body.replaceChildren();
  document.head.replaceChildren();
});
afterEach(() => vi.unstubAllGlobals());

const reported: unknown[] = [];
class Collector extends ErrorHandler {
  override handleError(error: unknown): void {
    reported.push(error);
  }
}

const mountTemplate = (template: ReturnType<typeof html>, extra: object = {}) => {
  class Page {
    static meta = { selector: "app-page", template };
  }
  Object.assign(Page.prototype, extra);
  const host = document.createElement("div");
  document.body.append(host);
  bootstrap(Page, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] });
  return host;
};

describe("DOM renderer: dev-time errors", () => {
  it("names an unknown tag and says how components are used", () => {
    expect(() => mountTemplate(html`<blink>x</blink>`)).toThrow(/Unknown element <blink>.*meta\.imports/);
  });

  it("names an unknown property on a native element and suggests a case fix", () => {
    mountTemplate(html`<input [readonly]="true">`);
    expect(String(reported[0])).toMatch(/Unknown property "readonly" on <input>.*Did you mean \[readOnly\]/);
  });

  it("points to [attr.x] when no property matches", () => {
    mountTemplate(html`<div [colour]="1"></div>`);
    expect(String(reported[0])).toMatch(/Unknown property "colour" on <div>.*\[attr\.colour\]/);
  });

  it("explains a bootstrap target that matches nothing", () => {
    class Page {
      static meta = { selector: "app-page", template: html`<p></p>` };
    }
    expect(() => bootstrap(Page, { renderer: createDomRenderer(), target: "#missing" })).toThrow(/"#missing" matched no element/);
  });

  it("allows custom elements and properties on them", () => {
    expect(() => mountTemplate(html`<my-widget [anything]="1"></my-widget>`)).toThrow(/Unknown element <my-widget>.*meta\.imports/);
    const r = createDomRenderer();
    const el = r.createElement("my-widget", null);
    expect(() => r.setProperty(el, "anything", 1)).not.toThrow();
  });
});

describe("DOM renderer: namespaces", () => {
  it("creates SVG elements in the SVG namespace, switching back to HTML inside foreignObject", () => {
    const host = mountTemplate(html`<svg viewBox="0 0 10 10"><circle r="4"></circle><foreignObject><p>hi</p></foreignObject></svg>`);
    const svg = host.querySelector("svg")!;
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.querySelector("circle")!.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.querySelector("p")!.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });

  it("creates MathML elements in the MathML namespace", () => {
    const host = mountTemplate(html`<math><mi>x</mi></math>`);
    expect(host.querySelector("mi")!.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
  });

  it("sets property bindings on SVG elements as attributes", async () => {
    const host = mountTemplate(html`<svg><circle [r]="radius()"></circle></svg>`, { radius: signal(4) });
    expect(host.querySelector("circle")!.getAttribute("r")).toBe("4");
  });
});

describe("DOM renderer: events and controls", () => {
  it("passes the native event as $event", () => {
    const seen: unknown[] = [];
    const host = mountTemplate(html`<button (click)="log($event)">x</button>`, { log: (e: unknown) => seen.push(e) });
    host.querySelector("button")!.click();
    expect(seen[0]).toBeInstanceOf(Event);
  });

  it("two-way binds a text input: the model flows in and the input event writes back", async () => {
    const name = signal("ann");
    const host = mountTemplate(html`<input [(value)]="name">`, { name });
    const input = host.querySelector("input")!;
    expect(input.value).toBe("ann");
    input.value = "bo";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(name()).toBe("bo");
    name.set("cy");
    await whenFlushed();
    expect(input.value).toBe("cy");
  });

  it("two-way binds a checkbox through checked and number inputs as numbers", () => {
    const on = signal(false);
    const age = signal<number | null>(3);
    const host = mountTemplate(html`<input type="checkbox" [(checked)]="on"><input type="number" [(value)]="age">`, { on, age });
    const [box, num] = host.querySelectorAll("input") as unknown as HTMLInputElement[];
    box!.checked = true;
    box!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(on()).toBe(true);
    num!.value = "42";
    num!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(age()).toBe(42);
  });
});

describe("DOM renderer: @defer triggers", () => {
  const templates = {
    interaction: html`@defer (on interaction) { <p class="done">content</p> } @placeholder { <div class="ph">wait</div> }`,
    hover: html`@defer (on hover) { <p class="done">content</p> } @placeholder { <div class="ph">wait</div> }`,
    viewport: html`@defer (on viewport(200)) { <p class="done">content</p> } @placeholder { <div class="ph">wait</div> }`,
    teleport: html`@defer (on teleport) { <p class="done">content</p> } @placeholder { <div class="ph">wait</div> }`,
  };
  const start = (clause: keyof typeof templates) => {
    class Page {
      static meta = { selector: "app-page", template: templates[clause] };
    }
    const host = document.createElement("div");
    document.body.append(host);
    const ref = bootstrap(Page, { renderer: createDomRenderer(), target: host });
    return { host, ref };
  };
  const settle = async () => {
    await whenFlushed();
    await Promise.resolve();
    await whenFlushed();
  };

  it("`on interaction` loads on click or keydown of the placeholder", async () => {
    const { host } = start("interaction");
    expect(host.querySelector(".done")).toBeNull();
    host.querySelector(".ph")!.dispatchEvent(new Event("click", { bubbles: true }));
    await settle();
    expect(host.querySelector(".done")).not.toBeNull();
  });

  it("`on hover` loads on mouseenter", async () => {
    const { host } = start("hover");
    host.querySelector(".ph")!.dispatchEvent(new Event("mouseenter"));
    await settle();
    expect(host.querySelector(".done")).not.toBeNull();
  });

  it("`on viewport` loads when the placeholder intersects, with the margin from its argument", async () => {
    let callback!: (entries: Array<{ isIntersecting: boolean }>) => void;
    const created: Array<{ options: IntersectionObserverInit; observed: Element[]; disconnected: boolean }> = [];
    class FakeObserver {
      state = { options: {} as IntersectionObserverInit, observed: [] as Element[], disconnected: false };
      constructor(cb: typeof callback, options: IntersectionObserverInit) {
        callback = cb;
        this.state.options = options;
        created.push(this.state);
      }
      observe = (el: Element) => void this.state.observed.push(el);
      disconnect = () => void (this.state.disconnected = true);
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const { host } = start("viewport");
    expect(created[0]!.options.rootMargin).toBe("200px");
    expect(created[0]!.observed).toEqual([host.querySelector(".ph")]);
    callback([{ isIntersecting: false }]);
    await settle();
    expect(host.querySelector(".done")).toBeNull();
    callback([{ isIntersecting: true }]);
    await settle();
    expect(host.querySelector(".done")).not.toBeNull();
    expect(created[0]!.disconnected).toBe(true);
  });

  it("stops observing when the block is destroyed before it fires", () => {
    const { host, ref } = start("interaction");
    const ph = host.querySelector(".ph")!;
    const remove = vi.spyOn(ph, "removeEventListener");
    ref.destroy();
    expect(remove).toHaveBeenCalled();
  });

  it("rejects a trigger it does not know, naming the renderer and its triggers", () => {
    expect(() => start("teleport")).toThrow(/trigger "teleport".*"dom".*viewport, interaction, hover/);
  });

  it("needs a placeholder to watch", () => {
    class NoPh {
      static meta = { selector: "app-page", template: html`@defer (on hover) { <p>x</p> }` };
    }
    const host = document.createElement("div");
    expect(() => bootstrap(NoPh, { renderer: createDomRenderer(), target: host })).toThrow(/hover.*@placeholder/);
  });
});
