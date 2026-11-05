import { beforeEach, describe, expect, it } from "vitest";
import { computed, effect, html, hotState, inject, signal, viewChildren } from "@gable/core";
import { mount } from "@gable/testing";
import { createTestRenderer } from "@gable/testing/renderer";

// The nine scenarios of the HMR prototype (TASK-1.9), replayed through fixture.hotReplace.
// A "new version" of a module is a fresh class with the same name, as a re-evaluated module would produce.

let log: string[] = [];
beforeEach(() => {
  log = [];
});

// --- Cart service, Counter and Badge components, wrapped in an App ------------------------------------

const cartV1 = () =>
  class Cart {
    static scope = "root";
    items = signal(0);
    add() {
      this.items.update((n) => n + 1);
    }
  };
const cartV2 = () =>
  class Cart {
    static scope = "root";
    items = signal(0);
    coupon = "NONE";
    vat = signal(20);
    add() {
      this.items.update((n) => n + 1);
    }
  };

const badgeV1 = (Cart: ReturnType<typeof cartV1>) =>
  class Badge {
    static meta = { selector: "app-badge", template: html`{{ label }}: {{ cart.items() }} item(s)` };
    label = "Cart";
    cart = inject(Cart);
    _ = log.push("badge");
    addToCart() {
      this.cart.add();
    }
  };
const badgeV2 = (Cart: ReturnType<typeof cartV1>) =>
  class Badge {
    static meta = { selector: "app-badge", template: html`{{ cart.items() }} in {{ label }}` };
    label = "Cart";
    cart = inject(Cart);
    _ = log.push("badge");
    addToCart() {
      this.cart.add();
    }
  };

const counterV1 = () =>
  class Counter {
    static meta = { selector: "app-counter", template: html`Count: {{ count() }} double: {{ double() }}` };
    count = signal(0);
    double = computed(() => this.count() * 2);
    _ = log.push("counter");
    increment() {
      this.count.update((n) => n + 1);
    }
  };

const appOf = (Badge: Function, Counter: Function) =>
  class App {
    static meta = {
      selector: "app-root",
      imports: [Badge, Counter],
      template: html`<app-badge id="header"></app-badge><app-badge id="side"></app-badge><app-counter></app-counter>`,
    };
    badges = viewChildren(Badge as any);
    counters = viewChildren(Counter as any);
  };

const mountApp = () => {
  const Cart = cartV1();
  const Badge = badgeV1(Cart);
  const Counter = counterV1();
  const fixture = mount(appOf(Badge, Counter) as any);
  const app = () => fixture.instance as any;
  const badges = (): any[] => app().badges();
  const counter = (): any => app().counters()[0];
  return { fixture, Cart, Badge, Counter, badges, counter };
};

describe("hotReplace: prototype scenarios on a single component", () => {
  it("2. a computed edit re-sets-up on a new instance, carries state across and disposes the old scope", async () => {
    const Counter = counterV1();
    const fixture = mount(Counter);
    fixture.instance.increment();
    fixture.instance.increment();
    fixture.instance.increment();
    await fixture.flush();
    const old = fixture.instance;
    expect(fixture.text()).toBe("Count: 3 double: 6");

    const result = fixture.hotReplace(
      class Counter {
        static meta = { selector: "app-counter", template: html`Count: {{ count() }} triple: {{ triple() }}` };
        count = signal(0);
        triple = computed(() => this.count() * 3);
        _ = log.push("counter");
        increment() {
          this.count.update((n) => n + 1);
        }
      },
    );
    await fixture.flush();

    expect(result.status).toBe("applied");
    expect(fixture.instance).not.toBe(old);
    expect(fixture.instance).toBeInstanceOf(Counter);
    expect(fixture.text()).toBe("Count: 3 triple: 9");
    fixture.instance.increment();
    await fixture.flush();
    expect(fixture.text()).toBe("Count: 4 triple: 12");
  });

  it("2b. effects of the old instance stop and effect bodies pick up edits", async () => {
    const seen: string[] = [];
    const v1 = () =>
      class Watcher {
        static meta = { selector: "app-w", template: html`{{ n() }}` };
        n = signal(1);
        _ = effect(() => void seen.push("v1:" + this.n()));
      };
    const fixture = mount(v1());
    const old = fixture.instance;
    fixture.hotReplace(
      class Watcher {
        static meta = { selector: "app-w", template: html`{{ n() }}` };
        n = signal(1);
        _ = effect(() => void seen.push("v2:" + this.n()));
      },
    );
    seen.length = 0;
    old.n.set(50);
    fixture.instance.n.set(7);
    await fixture.flush();
    expect(seen).toEqual(["v2:7"]);
  });

  it("4. renaming a field loses its value; renaming back does not recover it", async () => {
    const fixture = mount(counterV1());
    fixture.instance.increment();
    fixture.instance.increment();
    await fixture.flush();
    fixture.hotReplace(
      class Counter {
        static meta = { selector: "app-counter", template: html`Clicks: {{ clicks() }}` };
        clicks = signal(0);
        increment() {
          this.clicks.update((n) => n + 1);
        }
      },
    );
    await fixture.flush();
    expect(fixture.text()).toBe("Clicks: 0");
    fixture.hotReplace(counterV1());
    await fixture.flush();
    expect(fixture.text()).toBe("Count: 0 double: 0");
  });

  it("5. a field whose kind changes is not transferred", async () => {
    const fixture = mount(counterV1());
    fixture.instance.increment();
    await fixture.flush();
    fixture.hotReplace(
      class Counter {
        static meta = { selector: "app-counter", template: html`Plain: {{ count }}` };
        count = 0;
      },
    );
    await fixture.flush();
    expect(fixture.text()).toBe("Plain: 0");
  });

  it("new fields initialise, removed fields drop and plain data transfers", async () => {
    const v1 = () =>
      class Note {
        static meta = { selector: "app-note", template: html`{{ text }}` };
        text = "hello";
        gone = signal(1);
      };
    const fixture = mount(v1());
    fixture.instance.text = "edited at runtime";
    fixture.hotReplace(
      class Note {
        static meta = { selector: "app-note", template: html`{{ text }} {{ extra() }}` };
        text = "hello";
        extra = signal("new");
      },
    );
    await fixture.flush();
    expect(fixture.text()).toBe("edited at runtime new");
    expect("gone" in fixture.instance).toBe(false);
  });

  it("9. static hmr = 'reset' re-sets-up with fresh state", async () => {
    const fixture = mount(counterV1());
    fixture.instance.increment();
    fixture.instance.increment();
    await fixture.flush();
    fixture.hotReplace(
      class Counter {
        static hmr = "reset";
        static meta = { selector: "app-counter", template: html`Count: {{ count() }} triple: {{ triple() }}` };
        count = signal(0);
        triple = computed(() => this.count() * 3);
      },
    );
    await fixture.flush();
    expect(fixture.text()).toBe("Count: 0 triple: 0");
  });

  it("styles-only edit re-registers the CSS by id with no rebuild", async () => {
    const renderer = createTestRenderer();
    const v1 = () =>
      class Styled {
        static meta = { selector: "app-styled", template: html`<b>hi</b>`, styles: "b { color: black }" };
        _ = log.push("styled");
      };
    const fixture = mount(v1(), { renderer });
    expect(renderer.styles.get("Styled")).toBe("b { color: black }");
    const bold = fixture.query("b");
    fixture.hotReplace(
      class Styled {
        static meta = { selector: "app-styled", template: html`<b>hi</b>`, styles: "b { color: red }" };
        _ = log.push("styled");
      },
    );
    expect(renderer.styles.get("Styled")).toBe("b { color: red }");
    expect(fixture.query("b")).toBe(bold);
    expect(log).toEqual(["styled"]);
  });
});

describe("hotReplace: components in a tree and services", () => {
  it("1. a template edit on a child rebuilds only that view; other state and instances are untouched", async () => {
    const { fixture, Badge, Counter, badges, counter } = mountApp();
    fixture.query("app-counter")!;
    log.length = 0;
    fixture.hotReplace(
      class Counter {
        static meta = { selector: "app-counter", template: html`The count is {{ count() }}` };
        count = signal(0);
        double = computed(() => this.count() * 2);
        _ = log.push("counter");
        increment() {
          this.count.update((n) => n + 1);
        }
      },
    );
    await fixture.flush();
    expect(fixture.text()).toContain("The count is 0");
    expect(log).toEqual([]); // same instance, view rebuilt only
    void Badge;
    void Counter;
  });

  it("6. a service edit keeps its state and cascades to every instance that injected it, leaving others alone", async () => {
    const { fixture, badges, counter } = mountApp();
    const [header] = fixture.queryAll("app-badge");
    expect(fixture.text()).toContain("Cart: 0 item(s)");
    // add two items through the header badge's live service
    const badge = badges()[0]!;
    badge.addToCart();
    badge.addToCart();
    await fixture.flush();
    expect(fixture.text()).toContain("Cart: 2 item(s)Cart: 2 item(s)");
    log.length = 0;

    const result = fixture.hotReplace(cartV2());
    await fixture.flush();

    expect(result.status).toBe("applied");
    expect(log).toEqual(["badge", "badge"]); // both badges were re-set-up; the counter was not
    expect(fixture.text()).toContain("Cart: 2 item(s)Cart: 2 item(s)");
    badges()[1]!.addToCart();
    await fixture.flush();
    expect(fixture.text()).toContain("Cart: 3 item(s)Cart: 3 item(s)");
    void header;
  });

  it("7. one save with a service and its dependent re-sets-up the dependent exactly once", async () => {
    const { fixture, badges, counter } = mountApp();
    badges()[0]!.addToCart();
    await fixture.flush();
    log.length = 0;

    const Cart = cartV2();
    fixture.hotReplace(Cart, badgeV2(Cart));
    await fixture.flush();

    expect(log).toEqual(["badge", "badge"]);
    expect(fixture.text()).toContain("1 in Cart1 in Cart");
  });

  it("a parent's template edit keeps its children's state", async () => {
    const { fixture, Badge, Counter, badges, counter } = mountApp();
    counter().increment();
    counter().increment();
    await fixture.flush();
    fixture.hotReplace(
      class App {
        static meta = {
          selector: "app-root",
          imports: [Badge, Counter],
          template: html`<h1>Title</h1><app-counter></app-counter>`,
        };
      },
    );
    await fixture.flush();
    expect(fixture.text()).toBe("TitleCount: 2 double: 4");
  });

  it("a component's own providers are re-created with state carried over", async () => {
    const Store = class Store {
      n = signal(0);
    };
    const Shell = (template: any) =>
      class Shell {
        static meta = { selector: "app-shell", providers: [Store], template };
        store = inject(Store);
        _ = log.push("shell");
      };
    const fixture = mount(Shell(html`{{ store.n() }}`));
    fixture.instance.store.n.set(5);
    await fixture.flush();
    const oldStore = fixture.instance.store;
    fixture.hotReplace(
      class Shell {
        static meta = { selector: "app-shell", providers: [Store], template: html`n={{ store.n() }}` };
        store = inject(Store);
        extra = signal(1);
        _ = log.push("shell");
      },
    );
    await fixture.flush();
    expect(fixture.text()).toBe("n=5");
    expect(fixture.instance.store).not.toBe(oldStore);
    expect(fixture.instance.store.n()).toBe(5);
  });
});

describe("hotReplace: failure policy", () => {
  it("8. a module that failed to evaluate leaves the app untouched and reports to the error handler", async () => {
    const fixture = mount(counterV1());
    fixture.instance.increment();
    await fixture.flush();
    const old = fixture.instance;

    const result = fixture.hotReplace(new SyntaxError("Unexpected token ')'"));
    await fixture.flush().catch(() => {});

    expect(result.status).toBe("rolled-back");
    expect(fixture.instance).toBe(old);
    expect(fixture.text()).toBe("Count: 1 double: 2");
    const [report] = fixture.claimErrors();
    expect(report?.context.source).toBe("hmr");
    expect(report?.error).toBeInstanceOf(SyntaxError);

    // and a good edit afterwards still works
    expect(fixture.hotReplace(counterV1()).status).toBe("unchanged");
    fixture.hotReplace(
      class Counter {
        static meta = { selector: "app-counter", template: html`C={{ count() }}` };
        count = signal(0);
      },
    );
    await fixture.flush();
    expect(fixture.text()).toBe("C=1");
  });

  it("a Setup failure in the new class rolls the whole transaction back, including other classes in the batch", async () => {
    const { fixture, badges, counter } = mountApp();
    badges()[0]!.addToCart();
    counter().increment();
    await fixture.flush();
    const before = fixture.html();
    const counterBefore = counter();
    log.length = 0;

    const result = fixture.hotReplace(
      cartV2(),
      class Counter {
        static meta = { selector: "app-counter", template: html`broken` };
        count = signal(0);
        boom = (() => {
          throw new Error("setup exploded");
        })();
      },
    );
    const reports = fixture.claimErrors();
    await fixture.flush();

    expect(result.status).toBe("rolled-back");
    expect(reports.map((e) => e.context.source)).toEqual(["hmr"]);
    expect(fixture.html()).toBe(before);
    expect(counter()).toBe(counterBefore);
    // the old service is back in place and still shared
    badges()[1]!.addToCart();
    await fixture.flush();
    expect(fixture.text()).toContain("Cart: 2 item(s)Cart: 2 item(s)");
    // the old definitions are intact: a second try with a good class applies
    log.length = 0;
    expect(fixture.hotReplace(cartV2()).status).toBe("applied");
  });

  it("a template that cannot be built rolls back and the old view stays", async () => {
    const fixture = mount(counterV1());
    fixture.instance.increment();
    await fixture.flush();
    const result = fixture.hotReplace(
      class Counter {
        static meta = { selector: "app-counter", template: html`<app-missing></app-missing>` };
        count = signal(0);
        double = computed(() => this.count() * 2);
        _ = log.push("counter");
        increment() {
          this.count.update((n) => n + 1);
        }
      },
    );
    expect(result.status).toBe("rolled-back");
    expect(fixture.text()).toBe("Count: 1 double: 2");
    expect(fixture.claimErrors()[0]?.context.source).toBe("hmr");
  });
});

describe("hotReplace: hmr modes", () => {
  it("ignore: the old definition stays", async () => {
    const fixture = mount(counterV1());
    fixture.instance.increment();
    const result = fixture.hotReplace(
      class Counter {
        static hmr = "ignore";
        static meta = { selector: "app-counter", template: html`NEW {{ count() }}` };
        count = signal(0);
      },
    );
    await fixture.flush();
    expect(result.status).toBe("unchanged");
    expect(fixture.text()).toBe("Count: 1 double: 2");
  });

  it("reload: an edit asks for a full reload and applies nothing", async () => {
    const fixture = mount(counterV1());
    const result = fixture.hotReplace(
      class Counter {
        static hmr = "reload";
        static meta = { selector: "app-counter", template: html`NEW` };
        count = signal(0);
      },
    );
    expect(result.status).toBe("reload");
    expect(fixture.text()).toBe("Count: 0 double: 0");
  });

  it("a module-level hmr export applies to its classes; a class-level mode overrides it", async () => {
    const fixture = mount(counterV1());
    fixture.instance.increment();
    await fixture.flush();
    const Next = (hmr?: string) =>
      class Counter {
        static meta = { selector: "app-counter", template: html`Count: {{ count() }} triple: {{ triple() }}` };
        count = signal(0);
        triple = computed(() => this.count() * 3);
        static override = hmr;
      };
    expect(fixture.hotReplace({ Counter: Next(), hmr: "ignore" }).status).toBe("unchanged");
    expect(fixture.text()).toBe("Count: 1 double: 2");
    const Reset = class Counter {
      static hmr = "reset";
      static meta = { selector: "app-counter", template: html`Count: {{ count() }} triple: {{ triple() }}` };
      count = signal(0);
      triple = computed(() => this.count() * 3);
    };
    expect(fixture.hotReplace({ Counter: Reset, hmr: "ignore" }).status).toBe("applied");
    await fixture.flush();
    expect(fixture.text()).toBe("Count: 0 triple: 0");
  });
});

describe("hotState", () => {
  it("returns the stored value (same identity) when the module is evaluated again", () => {
    const meta = { url: "file:///src/store.ts?t=1", hot: {} };
    const first = hotState(meta, "count", () => signal(0));
    first.set(4);
    const again = hotState({ url: "file:///src/store.ts?t=2", hot: {} }, "count", () => signal(100));
    expect(again).toBe(first);
    expect(again()).toBe(4);
  });

  it("is discarded by reset: true or by renaming the key", () => {
    const meta = { url: "file:///src/other.ts", hot: {} };
    const first = hotState(meta, "a", () => signal(1));
    expect(hotState(meta, "a", () => signal(2), { reset: true })).not.toBe(first);
    expect(hotState(meta, "b", () => signal(3))()).toBe(3);
  });

  it("is plain init() without import.meta.hot", () => {
    const meta = { url: "file:///src/prod.ts" };
    const a = hotState(meta, "k", () => ({}));
    expect(hotState(meta, "k", () => ({}))).not.toBe(a);
  });
});
