import { afterEach, describe, expect, it, vi } from "vitest";
import { effect, html, lazy, signal } from "@gable/core";
import { toSignal } from "@gable/core/rxjs";
import { mount } from "@gable/testing";
import { Subject, debounceTime, of } from "rxjs";

afterEach(() => vi.useRealTimers());

describe("settle, flushSync and advance", () => {
  class Search {
    static meta = { selector: "app-search", template: html`<p>{{ results() }}</p>` };
    query = new Subject<string>();
    results = toSignal(this.query.pipe(debounceTime(300)), { initialValue: "none" });
  }

  it("advance(ms) drives debounceTime on the runner fake timers, then settles the view", async () => {
    vi.useFakeTimers();
    const f = mount(Search, { advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)) });
    f.instance.query.next("a");
    await f.advance(299);
    expect(f.text()).toBe("none");
    await f.advance(1);
    expect(f.text()).toBe("a");
    f.destroy();
  });

  it("advance(ms) falls back to the vi global when it is exposed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("vi", vi);
    try {
      const f = mount(Search);
      f.instance.query.next("b");
      await f.advance(300);
      expect(f.text()).toBe("b");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("settle() flushes bound Promises and Observables until nothing is scheduled", async () => {
    class Page {
      static meta = { selector: "app-page", template: html`<p>{{ data() }}</p>` };
      data = toSignal(of(1), { initialValue: 0 });
      later = Promise.resolve().then(() => this.data);
    }
    const f = mount(Page);
    await f.settle();
    expect(f.text()).toBe("1");
  });

  it("flushSync() applies pending effects without awaiting", () => {
    class Page {
      static meta = { selector: "app-page", template: html`<p>{{ n() }}</p>` };
      n = signal(0);
    }
    const f = mount(Page);
    f.instance.n.set(2);
    expect(f.text()).toBe("0");
    f.flushSync();
    expect(f.text()).toBe("2");
  });

  it("without fake timers or an advanceTimers option, advance explains what is missing", async () => {
    const f = mount(Search);
    await expect(f.advance(10)).rejects.toThrow(/fake timers/);
  });
});

describe("errors", () => {
  class Boom {
    static meta = { selector: "app-boom", template: html`` };
    n = signal(0);
    e = effect(() => {
      if (this.n() > 0) throw new Error("effect boom");
    });
  }

  it("settle() rethrows unclaimed reports; errors.expect(source) returns and clears them", async () => {
    const f = mount(Boom);
    f.instance.n.set(1);
    await expect(f.settle()).rejects.toThrow("effect boom");
    expect(f.errors.expect("event")).toEqual([]);
    const [report] = f.errors.expect("effect");
    expect(report!.context.source).toBe("effect");
    expect(f.errors.expect()).toEqual([]);
    f.destroy(); // nothing left over
  });

  it("leftover reports fail the test at teardown with their ErrorContext", async () => {
    const f = mount(Boom);
    f.instance.n.set(1);
    await f.flush().catch(() => {});
    expect(() => f.destroy()).toThrow("effect boom");
    expect(() => f.destroy()).not.toThrow(); // reported once
  });

  it("is also checked by [Symbol.dispose] and by an afterEach hook when the runner exposes one", async () => {
    const hooks: Array<() => void> = [];
    vi.stubGlobal("afterEach", (fn: () => void) => hooks.push(fn));
    try {
      const f = mount(Boom);
      f.instance.n.set(1);
      await f.flush().catch(() => {});
      // The hook registers once per module; in this run it may already be installed or absent.
      if (hooks.length > 0) expect(() => hooks[0]!()).toThrow("effect boom");
      else expect(() => f[Symbol.dispose]()).toThrow("effect boom");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("overrides", () => {
  class RealChild {
    static meta = { selector: "app-child", template: html`<b>real</b>` };
  }
  class StubChild {
    static meta = { selector: "app-child", template: html`<b>stub</b>` };
  }
  class Parent {
    static meta = { selector: "app-parent", imports: [RealChild], template: html`<app-child></app-child>` };
  }

  it("replaces an imported component for one test only", () => {
    const stubbed = mount(Parent, { overrides: [[RealChild, StubChild]] });
    expect(stubbed.text()).toBe("stub");
    expect(mount(Parent).text()).toBe("real");
  });

  it("replaces a lazy() entry with a stub component, never calling the loader", async () => {
    const loader = vi.fn(async () => ({ RealChild }));
    const entry = lazy(loader, "RealChild");
    class Page {
      static meta = { selector: "app-page", imports: [entry], template: html`@defer (when go()) { <app-child></app-child> } @placeholder { <i>wait</i> }` };
      go = signal(false);
    }
    const f = mount(Page, { overrides: [[entry, StubChild]] });
    f.instance.go.set(true);
    await f.flush();
    await f.defer[0]!.settle();
    expect(f.text().trim()).toBe("stub");
    expect(loader).not.toHaveBeenCalled();
  });

  it("replaces a lazy() entry with another lazy() entry", async () => {
    const entry = lazy(async () => ({ RealChild }), "RealChild");
    const other = lazy(async () => ({ StubChild }), "StubChild");
    class Page {
      static meta = { selector: "app-page", imports: [entry], template: html`@defer (when go()) { <app-child></app-child> }` };
      go = signal(true);
    }
    const f = mount(Page, { overrides: [[entry, other]] });
    await f.flush();
    await f.defer[0]!.settle();
    expect(f.text().trim()).toBe("stub");
  });
});

describe("html()", () => {
  it("is a stable pretty-printed snapshot", async () => {
    class Page {
      static meta = { selector: "app-page", template: html`<ul><li>a</li><li>b</li></ul>` };
    }
    const f = mount(Page);
    expect(f.html()).toBe(["<app-page>", "  <ul>", "    <li>a</li>", "    <li>b</li>", "  </ul>", "</app-page>"].join("\n"));
    expect(f.html()).toBe(f.html());
  });
});
