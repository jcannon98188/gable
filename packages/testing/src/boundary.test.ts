import { describe, expect, it } from "vitest";
import { InjectionToken, flushSync, html, inject, onCleanup, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { createTestRenderer, createTestRoot, serialize } from "@gable/testing/renderer";

const COUNT = new InjectionToken<{ n: ReturnType<typeof signal<number>> }>("count");

describe("renderer boundary (meta.renderer)", () => {
  it("builds the template and projected content with the boundary renderer, host stays in the parent renderer", () => {
    const inner = createTestRenderer();
    const innerRoot = createTestRoot();
    let destroyed = 0;
    inner.destroy = () => void destroyed++;

    class Leaf {
      static meta = { selector: "x-leaf", template: html`<b [attr.title]="count.n()"></b>` };
      count = inject(COUNT);
    }
    class Scene {
      static meta = {
        selector: "x-scene",
        template: html`<slot></slot>`,
        renderer: () => ({ renderer: inner, root: innerRoot }),
      };
    }
    class App {
      static meta = {
        selector: "x-app",
        imports: [Scene, Leaf],
        template: html`<p>dom</p><x-scene><x-leaf></x-leaf></x-scene>`,
      };
    }
    const count = { n: signal(1) };
    const fixture = mount(App, { providers: [{ provide: COUNT, useValue: count }] });
    // the DOM-side tree has the host element but none of the scene nodes
    expect(serialize(fixture.root)).toContain("x-scene");
    expect(serialize(fixture.root)).not.toContain("x-leaf");
    // the scene nodes live in the boundary root, built by the inner renderer
    expect(serialize(innerRoot)).toContain("x-leaf");
    expect(serialize(innerRoot)).toContain("<b");
    // effects inside the scene bind through the inner renderer; the injector is shared with the app
    count.n.set(2);
    flushSync();
    expect(serialize(innerRoot)).toContain('title="2"');
    fixture.destroy();
    expect(destroyed).toBe(1);
  });

  it("onCleanup runs when the component scope is disposed", () => {
    const log: string[] = [];
    class C {
      static meta = { selector: "x-c", template: html`<p></p>` };
      _ = onCleanup(() => log.push("cleanup"));
    }
    const fixture = mount(C);
    expect(log).toEqual([]);
    fixture.destroy();
    expect(log).toEqual(["cleanup"]);
    expect(() => onCleanup(() => {})).toThrow(/outside a scope/);
  });

  it("providers declared on the boundary component are NOT visible to slot-projected content (it is built in the parent's view), but are visible to the component's own template", () => {
    const TOKEN = new InjectionToken<string>("boundary-token");
    const seen: Record<string, string | null> = {};
    class OwnChild {
      static meta = { selector: "x-own", template: html`<i></i>` };
      t = (seen.own = inject(TOKEN, { optional: true }));
    }
    class Projected {
      static meta = { selector: "x-projected", template: html`<i></i>` };
      t = (seen.projected = inject(TOKEN, { optional: true }));
    }
    const inner = createTestRenderer();
    class Scene {
      static meta = {
        selector: "x-scene2",
        imports: [OwnChild],
        providers: [{ provide: TOKEN, useValue: "from-boundary" }],
        template: html`<x-own></x-own><slot></slot>`,
        renderer: () => ({ renderer: inner, root: createTestRoot() }),
      };
    }
    class App {
      static meta = { selector: "x-app2", imports: [Scene, Projected], template: html`<x-scene2><x-projected></x-projected></x-scene2>` };
    }
    mount(App);
    expect(seen.own).toBe("from-boundary");
    expect(seen.projected).toBeNull();
  });
});
