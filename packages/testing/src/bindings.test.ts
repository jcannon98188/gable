import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";

describe("bindings", () => {
  class View {
    static meta = {
      selector: "app-view",
      template: html`<div [attr.data-id]="id()" [class.active]="active()" [style.color]="color()" [title]="user.name" [hidden]="!visible()">
        {{ user?.name ?? 'anonymous' }}
      </div>`,
    };
    id = signal<string | null>("a1");
    active = signal(true);
    color = signal<string | null>("red");
    visible = signal(true);
    user = { name: "Ada" };
  }

  it("applies attribute, class, style and property bindings and keeps them updated", async () => {
    const f = mount(View);
    const div = f.query("div")!;
    expect(div.attrs["data-id"]).toBe("a1");
    expect(div.classes).toEqual(["active"]);
    expect(div.styles.color).toBe("red");
    expect(div.props.title).toBe("Ada");
    expect(div.props.hidden).toBe(false);
    expect(f.text()).toBe("Ada");

    f.instance.id.set(null);
    f.instance.active.set(false);
    f.instance.color.set(null);
    f.instance.visible.set(false);
    await f.flush();
    expect(div.attrs["data-id"]).toBeUndefined();
    expect(div.classes).toEqual([]);
    expect(div.styles.color).toBeUndefined();
    expect(div.props.hidden).toBe(true);
  });

  it("calls event handlers with references, literals and the event", () => {
    const calls: unknown[][] = [];
    class Clicker {
      static meta = {
        selector: "app-clicker",
        template: html`<button (click)="log($event, 'lit', 7, true, item.id, count())">go</button>`,
      };
      item = { id: "x" };
      count = signal(3);
      log(...args: unknown[]) {
        calls.push([this === f.instance, ...args]);
      }
    }
    const f = mount(Clicker);
    f.dispatch(f.query("button")!, "click", { type: "click" });
    expect(calls).toEqual([[true, { type: "click" }, "lit", 7, true, "x", 3]]);
  });

  it("stops listening after destroy", () => {
    let n = 0;
    class C {
      static meta = { selector: "app-c", template: html`<button (click)="hit()">x</button>` };
      hit() {
        n++;
      }
    }
    const f = mount(C);
    const button = f.query("button")!;
    f.dispatch(button, "click");
    f.destroy();
    f.dispatch(button, "click");
    expect(n).toBe(1);
  });

  it("two-way binds a writable signal to a property", async () => {
    class Form {
      static meta = { selector: "app-form", template: html`<input [(value)]="name" /><p>{{ name() }}</p>` };
      name = signal("a");
    }
    const f = mount(Form);
    const input = f.query("input")!;
    expect(input.props.value).toBe("a");
    f.dispatch(input, "valueChange", "bee");
    expect(f.instance.name()).toBe("bee");
    await f.flush();
    expect(f.text()).toBe("bee");
    f.instance.name.set("c");
    await f.flush();
    expect(input.props.value).toBe("c");
  });

  it("exposes template refs as template-local names", () => {
    const seen: unknown[] = [];
    class R {
      static meta = { selector: "app-r", template: html`<input #box /><button (click)="take(box)">x</button>` };
      take(node: unknown) {
        seen.push(node);
      }
    }
    const f = mount(R);
    f.dispatch(f.query("button")!, "click");
    expect(seen).toEqual([f.query("input")]);
    expect(seen[0]).toBe(f.query("input"));
  });
});
