import { describe, expect, it } from "vitest";
import { computed, contentChild, contentChildren, html, input, signal, viewChild, viewChildren } from "@gable/core";
import { mount } from "@gable/testing";

class Card {
  static meta = {
    selector: "app-card",
    host: { "[class.open]": "open()", role: "region", "(click)": "bump()" },
    template: html`<header><slot name="title">Untitled</slot></header><main><slot></slot></main>`,
  };
  open = input(true);
  clicks = signal(0);
  bump() {
    this.clicks.update((n) => n + 1);
  }
}

describe("composition: slots and host", () => {
  it("projects default and named slot content, evaluated in the parent, with fallback content", async () => {
    class Parent {
      static meta = {
        selector: "app-parent",
        imports: [Card],
        template: html`<app-card><h2 slot="title">{{ heading() }}</h2><p>{{ body() }}</p></app-card><app-card>only body</app-card>`,
      };
      heading = signal("Hello");
      body = signal("text");
    }
    const f = mount(Parent);
    const [first, second] = f.queryAll("app-card");
    expect(f.queryAll("header")[0]!.children.map((c) => c.tag)).toEqual(["h2"]);
    expect(first!.children[0]!.children[0]!.children[0]!.text).toBe("Hello");
    expect(f.text()).toContain("text");
    expect(f.queryAll("header")[1]!.children[0]!.text).toBe("Untitled");
    expect(second!.children[1]!.children[0]!.text).toBe("only body");

    f.instance.heading.set("Bye");
    await f.flush();
    expect(f.query("h2")!.children[0]!.text).toBe("Bye");
  });

  it("applies meta.host classes, attributes and listeners", async () => {
    class Parent {
      static meta = { selector: "app-parent", imports: [Card], template: html`<app-card [open]="isOpen()"></app-card>` };
      isOpen = signal(true);
      card = viewChild(Card);
    }
    const f = mount(Parent);
    const host = f.query("app-card")!;
    expect(host.attrs.role).toBe("region");
    expect(host.classes).toContain("open");
    f.instance.isOpen.set(false);
    await f.flush();
    expect(host.classes).not.toContain("open");
    f.dispatch(host, "click");
    expect(f.instance.card()!.clicks()).toBe(1);
  });
});

class Item {
  static meta = { selector: "app-item", template: html`<li>item</li>` };
  id = input(0);
}

describe("composition: queries", () => {
  it("viewChild / viewChildren update reactively as children come and go", async () => {
    class List {
      static meta = {
        selector: "app-list",
        imports: [Item],
        template: html`@if (show()) {<app-item id="1"></app-item>}@for (n of numbers(); track n) {<app-item [id]="n"></app-item>}<span #tag></span>`,
      };
      show = signal(false);
      numbers = signal<number[]>([]);
      first = viewChild(Item);
      all = viewChildren(Item);
      tag = viewChild<unknown>("tag");
      count = computed(() => this.all().length);
    }
    const f = mount(List);
    expect(f.instance.first()).toBeUndefined();
    expect(f.instance.count()).toBe(0);
    expect(f.instance.tag()).toBe(f.query("span"));

    f.instance.show.set(true);
    f.instance.numbers.set([5, 6]);
    await f.flush();
    expect(f.instance.count()).toBe(3);
    expect(f.instance.first()).toBeInstanceOf(Item);

    f.instance.show.set(false);
    await f.flush();
    expect(f.instance.count()).toBe(2);
    expect(f.instance.all().map((i) => i.id())).toEqual([5, 6]);
  });

  it("contentChild / contentChildren see projected content", async () => {
    class Tabs {
      static meta = { selector: "app-tabs", template: html`<slot></slot><em>{{ n() }}</em>` };
      items = contentChildren(Item);
      one = contentChild(Item);
      n = computed(() => this.items().length);
    }
    class Host {
      static meta = {
        selector: "app-host",
        imports: [Tabs, Item],
        template: html`<app-tabs>@if (on()) {<app-item></app-item>}<app-item></app-item></app-tabs>`,
      };
      on = signal(true);
      tabs = viewChild(Tabs);
    }
    const f = mount(Host);
    expect(f.query("em")!.children[0]!.text).toBe("2");
    expect(f.instance.tabs()!.one()).toBeInstanceOf(Item);
    f.instance.on.set(false);
    await f.flush();
    expect(f.query("em")!.children[0]!.text).toBe("1");
  });

  it("contentChildren picks up content created after first render by @if and @for, and tracks removals", async () => {
    class Tabs {
      static meta = { selector: "app-tabs", template: html`<slot></slot><em>{{ n() }}</em>` };
      items = contentChildren(Item);
      n = computed(() => this.items().length);
    }
    class Host {
      static meta = {
        selector: "app-host",
        imports: [Tabs, Item],
        template: html`<app-tabs>@if (on()) {<app-item></app-item>}@for (i of list(); track i) {<app-item></app-item>}</app-tabs>`,
      };
      on = signal(false);
      list = signal<number[]>([]);
    }
    const f = mount(Host);
    const count = () => f.query("em")!.children[0]!.text;
    expect(count()).toBe("0");
    f.instance.on.set(true);
    await f.flush();
    expect(count()).toBe("1");
    f.instance.list.set([1, 2]);
    await f.flush();
    expect(count()).toBe("3");
    f.instance.list.set([2]);
    f.instance.on.set(false);
    await f.flush();
    expect(count()).toBe("1");
  });

  it("does not leak a nested component's children into an outer content query", () => {
    class Wrap {
      static meta = { selector: "app-wrap", imports: [Item], template: html`<app-item></app-item>` };
      content = contentChildren(Item);
    }
    class Host {
      static meta = { selector: "app-host", imports: [Wrap, Item], template: html`<app-wrap></app-wrap>` };
      wrap = viewChild(Wrap);
    }
    const f = mount(Host);
    expect(f.queryAll("app-item")).toHaveLength(1);
    expect(f.instance.wrap()!.content()).toEqual([]);
  });
});

describe("contentChildren order", () => {
  it("lists a late-created match in document order, not creation order", async () => {
    class Tabs {
      static meta = { selector: "app-tabs", template: html`<slot></slot>` };
      items = contentChildren(Item);
      ids = computed(() => this.items().map((i) => i.id()));
    }
    class Host {
      static meta = {
        selector: "app-host",
        imports: [Tabs, Item],
        template: html`<app-tabs><app-item [id]="1"></app-item>@if (on()) {<app-item [id]="2"></app-item>}<app-item [id]="3"></app-item>@for (n of list(); track n) {<app-item [id]="n"></app-item>}</app-tabs>`,
      };
      on = signal(false);
      list = signal<number[]>([]);
      tabs = viewChild(Tabs);
    }
    const f = mount(Host);
    expect(f.instance.tabs()!.ids()).toEqual([1, 3]);
    f.instance.on.set(true);
    await f.flush();
    expect(f.instance.tabs()!.ids()).toEqual([1, 2, 3]);
    f.instance.list.set([4]);
    await f.flush();
    f.instance.on.set(false);
    await f.flush();
    f.instance.on.set(true);
    await f.flush();
    expect(f.instance.tabs()!.ids()).toEqual([1, 2, 3, 4]);
  });
});
