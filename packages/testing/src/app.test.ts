import { describe, expect, it } from "vitest";
import { type ComponentClass, bootstrap, createComponent, createInjector, html, inject, input, InjectionToken, signal } from "@gable/core";
import { createTestRenderer, createTestRoot } from "@gable/testing/renderer";
import { mount } from "@gable/testing";

const GREETING = new InjectionToken<string>("greeting");

class Hello {
  static meta = { selector: "app-hello", template: html`<p>{{ greeting }}, {{ name() }}</p>` };
  greeting = inject(GREETING);
  name = input("world");
}

describe("scoped styles", () => {
  class Box {
    static meta = { selector: "app-box", styles: ".a { color: red }", template: html`<div class="a">x</div>` };
  }
  class Plain {
    static meta = { selector: "app-plain", styles: ".b { color: blue }", encapsulation: "none", template: html`<div>x</div>` };
  }

  it("registers styles by component id and stamps the scoping token on the host and its elements", () => {
    const renderer = createTestRenderer();
    const f = mount(Box, { renderer });
    expect(renderer.styles.get("Box")).toBe(".a { color: red }");
    expect(f.root.attrs["g-Box"]).toBe("");
    expect(f.query("div")!.attrs["g-Box"]).toBe("");
  });

  it("registers once however many instances exist, and re-registering an id replaces it in place", () => {
    const renderer = createTestRenderer();
    mount(Box, { renderer });
    mount(Box, { renderer });
    expect([...renderer.styles.keys()]).toEqual(["Box"]);
    renderer.registerStyles!("Box", ".a { color: green }");
    expect([...renderer.styles.entries()]).toEqual([["Box", ".a { color: green }"]]);
  });

  it("can opt out of scoping", () => {
    const renderer = createTestRenderer();
    const f = mount(Plain as unknown as ComponentClass<Plain>, { renderer });
    expect(renderer.styles.get("Plain")).toBe(".b { color: blue }");
    expect(Object.keys(f.query("div")!.attrs)).toEqual([]);
  });

  it("stamps projected content with the token of the component that wrote it", () => {
    class Shell {
      static meta = { selector: "app-shell", styles: ".s{}", template: html`<slot></slot>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Shell], styles: ".p{}", template: html`<app-shell><i>c</i></app-shell>` };
    }
    const f = mount(Page, { renderer: createTestRenderer() });
    expect(Object.keys(f.query("i")!.attrs)).toEqual(["g-Page"]);
    expect(Object.keys(f.query("app-shell")!.attrs).sort()).toEqual(["g-Page", "g-Shell"]);
  });
});

describe("createComponent", () => {
  it("creates a component with an injector, initial inputs and settable inputs, then destroys it", async () => {
    const renderer = createTestRenderer();
    const root = createTestRoot();
    const injector = createInjector([{ provide: GREETING, useValue: "Hi" }]);
    const ref = createComponent(Hello, { renderer, injector, inputs: { name: "Ada" }, parent: root });
    expect(root.children).toContain(ref.host);
    expect(ref.host.tag).toBe("app-hello");
    expect(ref.host.children[0]!.children[0]!.text).toBe("Hi, Ada");
    ref.setInput("name", "Bob");
    await Promise.resolve();
    await Promise.resolve();
    expect(ref.host.children[0]!.children[0]!.text).toBe("Hi, Bob");
    ref.destroy();
    expect(root.children).toHaveLength(0);
  });

  it("adopts a host element it is given", () => {
    const renderer = createTestRenderer();
    const host = renderer.createElement("section", null);
    const injector = createInjector([{ provide: GREETING, useValue: "Yo" }]);
    const ref = createComponent(Hello, { renderer, injector, host });
    expect(ref.host).toBe(host);
    expect(host.tag).toBe("section");
    expect(host.children[0]!.tag).toBe("p");
  });

  it("rejects an input name the component does not declare", () => {
    const renderer = createTestRenderer();
    const injector = createInjector([{ provide: GREETING, useValue: "x" }]);
    expect(() => createComponent(Hello, { renderer, injector, inputs: { nope: 1 } as never })).toThrow(/no input "nope"/);
  });
});

describe("bootstrap", () => {
  it("mounts the root into the target with the given providers and renderer", async () => {
    class App {
      static meta = { selector: "app-root", template: html`<h1>{{ greeting }}</h1>` };
      greeting = inject(GREETING);
      count = signal(0);
    }
    const renderer = createTestRenderer();
    const target = createTestRoot();
    const app = bootstrap(App, { renderer, providers: [{ provide: GREETING, useValue: "Hello app" }], target });
    expect(app.host).toBe(target);
    expect(target.attrs).toEqual({});
    expect(target.children[0]!.tag).toBe("h1");
    expect(target.children[0]!.children[0]!.text).toBe("Hello app");
    app.destroy();
    expect(target.children).toHaveLength(0);
  });

  it("fails clearly when the renderer cannot resolve the target", () => {
    class App {
      static meta = { selector: "app-root", template: html`x` };
    }
    expect(() => bootstrap(App, { renderer: createTestRenderer(), target: "#app" })).toThrow(/cannot resolve the target/);
  });
});
