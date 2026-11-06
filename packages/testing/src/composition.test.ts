import { describe, expect, it } from "vitest";
import { from } from "rxjs";
import { html, input, model, output, signal } from "@gable/core";
import { mount } from "@gable/testing";

class Badge {
  static meta = { selector: "app-badge", template: html`<b>{{ label() }}</b><button (click)="pick()">pick</button>` };
  label = input("none");
  picked = output<string>();
  pick() {
    this.picked.emit(`picked ${this.label()}`);
  }
}

class Needy {
  static meta = { selector: "app-needy", template: html`<i>{{ name() }}</i>` };
  name = input.required<string>();
}

class Toggle {
  static meta = { selector: "app-toggle", template: html`<button (click)="flip()">{{ on() }}</button>` };
  on = model(false);
  flip() {
    this.on.set(!this.on());
  }
}

describe("composition: imports, inputs, outputs, models", () => {
  it("renders an imported child and binds its input reactively", async () => {
    class Parent {
      static meta = { selector: "app-parent", imports: [Badge], template: html`<app-badge [label]="text()"></app-badge>` };
      text = signal("a");
    }
    const f = mount(Parent);
    expect(f.query("app-badge b")?.children[0]?.text).toBe("a");
    f.instance.text.set("b");
    await f.flush();
    expect(f.text()).toContain("b");
  });

  it("sets an input from a static attribute and falls back to its default", () => {
    class Parent {
      static meta = {
        selector: "app-parent",
        imports: [Badge],
        template: html`<app-badge label="hi"></app-badge><app-badge></app-badge>`,
      };
    }
    const f = mount(Parent);
    expect(f.queryAll("b").map((b) => b.children[0]!.text)).toEqual(["hi", "none"]);
  });

  it("delivers outputs to parent handlers, and an output is an Observable", () => {
    const seen: string[] = [];
    class Parent {
      static meta = { selector: "app-parent", imports: [Badge], template: html`<app-badge label="x" (picked)="got($event)"></app-badge>` };
      got(v: string) {
        seen.push(v);
      }
    }
    const f = mount(Parent);
    f.dispatch(f.query("button")!, "click");
    expect(seen).toEqual(["picked x"]);

    const badge = new Badge();
    const viaRx: string[] = [];
    from(badge.picked).subscribe((v) => viaRx.push(v));
    badge.picked.emit("direct");
    expect(viaRx).toEqual(["direct"]);
  });

  it("two-way binds a model with [(name)]", async () => {
    class Parent {
      static meta = { selector: "app-parent", imports: [Toggle], template: html`<app-toggle [(on)]="flag"></app-toggle><p>{{ flag() }}</p>` };
      flag = signal(false);
    }
    const f = mount(Parent);
    f.dispatch(f.query("button")!, "click");
    expect(f.instance.flag()).toBe(true);
    await f.flush();
    expect(f.query("p")!.children[0]!.text).toBe("true");
    f.instance.flag.set(false);
    await f.flush();
    expect(f.query("button")!.children[0]!.text).toBe("false");
  });

  it("fails clearly when a required input is read before it is set", () => {
    class Parent {
      static meta = { selector: "app-parent", imports: [Needy], template: html`<app-needy></app-needy>` };
    }
    const f = mount(Parent);
    expect(String(f.claimErrors()[0]?.error)).toMatch(/required input "name"/i);
  });

  it("throws a clear dev-time error for an element that is not imported", () => {
    class Parent {
      static meta = { selector: "app-parent", template: html`<app-badge></app-badge>` };
    }
    expect(() => mount(Parent)).toThrow(/Unknown element <app-badge>.*meta\.imports/s);
  });

  it("applies an imported attribute directive to a matching element", () => {
    let hosts = 0;
    class Marker {
      static meta = { selector: "[marked]", host: { role: "note", "[class.on]": "true" } };
      _ = (hosts += 1);
    }
    class Parent {
      static meta = { selector: "app-parent", imports: [Marker], template: html`<p marked>x</p><p>y</p>` };
    }
    const f = mount(Parent);
    const [a, b] = f.queryAll("p");
    expect(a!.attrs.role).toBe("note");
    expect(a!.classes).toContain("on");
    expect(b!.attrs.role).toBeUndefined();
    expect(hosts).toBe(1);
  });
});

describe("host bindings and required inputs", () => {
  class Row {
    static meta = { selector: "li[app-row]", host: { "[class.done]": "done()", "[attr.data-name]": "name()" }, template: html`{{ name() }}` };
    name = input.required<string>();
    done = input(false);
  }
  class List {
    static meta = { selector: "app-list", imports: [Row], template: html`<ul><li app-row [name]="label()" [done]="true"></li></ul>` };
    label = signal("one");
  }

  it("lets meta.host bindings read a required input the parent binds", async () => {
    const fixture = mount(List);
    await fixture.settle();
    const row = fixture.query("li")!;
    expect(row.classes).toContain("done");
    expect(row.attrs["data-name"]).toBe("one");
    fixture.instance.label.set("two");
    await fixture.settle();
    expect(row.attrs["data-name"]).toBe("two");
  });
});
