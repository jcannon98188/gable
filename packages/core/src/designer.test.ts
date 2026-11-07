import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { html, input, signal } from "@gable/core";
import { createDevtools, type DevtoolsInstance } from "@gable/core/devtools";
import { createDesigner, type DesignerInstance } from "@gable/core/designer";
import { mount } from "@gable/testing";

let dt: DevtoolsInstance;
let designer: DesignerInstance;
const target: { __GABLE_DEVTOOLS_HOOK__?: any; __GABLE_DESIGNER_HOOK__?: any } = {};
beforeEach(() => {
  dt = createDevtools(target);
  designer = createDesigner(target);
});
afterEach(() => {
  designer.dispose();
  dt.dispose();
});

class Child {
  static meta = { selector: "app-child", template: html`<b>{{ label() }}</b>` };
  label = input("none");
}
class Counter {
  static meta = {
    selector: "app-counter",
    imports: [Child],
    template: html`<p>{{ n() }}</p>
      @for (i of items(); track i) {
        <li class="row">{{ i }}</li>
      }
      @if (show()) {
        <em>shown</em>
      }
      <app-child [label]="'x'"></app-child>
      <button (click)="inc()">+</button>`,
  };
  n = signal(0);
  items = signal([1, 2, 3]);
  show = signal(false);
  inc() {
    this.n.set(this.n() + 1);
  }
}

describe("design layer", () => {
  it("maps a rendered element to its range inside the template literal, and a child's element to the child's template", () => {
    const f = mount(Counter);
    const p = designer.hook.nodeOf(f.query("p")!)!;
    expect(p.tag).toBe("p");
    expect(p.component?.name).toBe("Counter");
    expect(p.raw.slice(p.start, p.end)).toBe("<p>{{ n() }}</p>");
    expect(p.raw.slice(p.start, p.openEnd)).toBe("<p>");
    const b = designer.hook.nodeOf(f.query("b")!)!;
    expect(b.component?.name).toBe("Child");
    expect(b.raw.slice(b.start, b.end)).toBe("<b>{{ label() }}</b>");
    // the projected host element belongs to the template that wrote it
    const host = designer.hook.nodeOf(f.query("app-child")!)!;
    expect(host.component?.name).toBe("Counter");
  });

  it("keeps a registry from a template node to every element it rendered: many under @for, none under a false @if", () => {
    const f = mount(Counter);
    const row = designer.hook.nodeOf(f.query("li")!)!;
    const rows = designer.hook.elementsOf(row.id);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(f.queryAll("li"));
    expect(row.elements).toBe(3);
    // an @if that is false has rendered nothing, so it has no node to ask about
    expect(designer.hook.nodeAt(row.raw, row.raw.indexOf("<em>"))).toBeNull();
    f.instance.show.set(true);
    f.flushSync();
    const em = designer.hook.nodeAt(row.raw, row.raw.indexOf("shown"))!;
    expect(em.tag).toBe("em");
    expect(designer.hook.elementsOf(em.id)).toHaveLength(1);
  });

  it("forgets elements that left the document", () => {
    const node = { tag: "p", pos: { start: 0, openEnd: 3, end: 10, tpl: Object.assign(["<p>x</p>"], { raw: ["<p>x</p>"] }) as unknown as TemplateStringsArray } };
    const el = { isConnected: true };
    designer.sink.element(el, node, {});
    const id = designer.hook.nodeAt("<p>x</p>", 1)!.id;
    expect(designer.hook.elementsOf(id)).toEqual([el]);
    el.isConnected = false;
    expect(designer.hook.elementsOf(id)).toEqual([]);
    expect(designer.hook.nodeAt("<p>x</p>", 1)).toBeNull();
  });

  it("finds the innermost node containing an offset", () => {
    const f = mount(Counter);
    const li = designer.hook.nodeOf(f.query("li")!)!;
    const text = li.raw.indexOf("{{ i }}");
    expect(designer.hook.nodeAt(li.raw, text)!.tag).toBe("li");
    expect(designer.hook.nodeAt(li.raw, li.raw.indexOf("(click)"))!.tag).toBe("button");
    expect(designer.hook.nodeAt("not a template", 3)).toBeNull();
  });

  it("mutes user events at the renderer's listen, and only while muted", () => {
    const f = mount(Counter);
    const button = f.query("button")!;
    designer.hook.muted = true;
    f.dispatch(button, "click");
    expect(f.instance.n()).toBe(0);
    designer.hook.muted = false;
    f.dispatch(button, "click");
    expect(f.instance.n()).toBe(1);
  });

  it("is inert once disposed", () => {
    designer.dispose();
    const f = mount(Counter);
    expect(designer.hook.nodeOf(f.query("p")!)).toBeNull();
  });
});
