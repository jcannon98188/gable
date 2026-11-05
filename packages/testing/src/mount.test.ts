import { describe, expect, it } from "vitest";
import { effect, html, signal } from "@gable/core";
import { mount } from "@gable/testing";

class Counter {
  static meta = {
    selector: "app-counter",
    template: html`<p class="label" [title]="title()">Count: {{ count() }}</p>`,
  };
  count = signal(0);
  title = signal("zero");
}

describe("mount", () => {
  it("renders the initial view, then updates it after a signal write and flush", async () => {
    const fixture = mount(Counter);
    expect(fixture.text()).toBe("Count: 0");
    expect(fixture.html()).toBe(
      ['<app-counter>', '  <p class="label">Count: 0</p>', "</app-counter>"].join("\n"),
    );

    fixture.instance.count.set(1);
    expect(fixture.text()).toBe("Count: 0"); // never auto-flushes synchronously
    await fixture.flush();

    expect(fixture.text()).toBe("Count: 1");
    expect(fixture.query("p.label")?.children[0]).toMatchObject({ kind: "text", text: "Count: 1" });
  });

  it("binds element properties", async () => {
    const fixture = mount(Counter);
    const p = fixture.query("app-counter > p")!;
    expect(p.props.title).toBe("zero");
    fixture.instance.title.set("one");
    await fixture.flush();
    expect(p.props.title).toBe("one");
    expect(fixture.queryAll("p")).toHaveLength(1);
    expect(fixture.query("section")).toBeNull();
  });

  it("coalesces writes in one tick into one effect run", async () => {
    let runs = 0;
    class Watcher {
      static meta = { selector: "app-w", template: html`<i>{{ a() }}</i>` };
      a = signal(0);
      b = signal(0);
      _ = effect(() => {
        this.a();
        this.b();
        runs++;
      });
    }
    const fixture = mount(Watcher);
    expect(runs).toBe(1);
    fixture.instance.a.set(1);
    fixture.instance.a.set(2);
    fixture.instance.b.set(1);
    await fixture.flush();
    expect(runs).toBe(2);
    expect(fixture.text()).toBe("2");
  });

  it("does not update the view on plain-field mutation", async () => {
    class Plain {
      static meta = { selector: "app-plain", template: html`<b>{{ n }}</b>` };
      n = 1;
    }
    const fixture = mount(Plain);
    fixture.instance.n = 2;
    await fixture.flush();
    expect(fixture.text()).toBe("1");
  });

  it("stops updating after destroy", async () => {
    const fixture = mount(Counter);
    const p = fixture.query("p")!;
    fixture.destroy();
    fixture.instance.count.set(5);
    await fixture.flush();
    expect(p.children[0]).toMatchObject({ text: "Count: 0" });
    expect(fixture.html()).toBe("");
  });
});
