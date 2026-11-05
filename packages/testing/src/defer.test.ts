import { afterEach, describe, expect, it, vi } from "vitest";
import { html, lazy, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { createTestRenderer } from "@gable/testing/renderer";

afterEach(() => vi.useRealTimers());

class Chart {
  static meta = { selector: "app-chart", template: html`<canvas></canvas>` };
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("@defer", () => {
  it("shows the placeholder, then the content once triggered", async () => {
    class Page {
      static meta = {
        selector: "app-page",
        template: html`@defer (when ready()) { <p>content</p> } @placeholder { <p>waiting</p> }`,
      };
      ready = signal(false);
    }
    const f = mount(Page);
    expect(f.defer).toHaveLength(1);
    expect(f.defer[0]!.state).toBe("placeholder");
    expect(f.text()).toContain("waiting");
    f.instance.ready.set(true);
    await f.flush();
    await f.defer[0]!.settle();
    expect(f.defer[0]!.state).toBe("complete");
    expect(f.text()).toContain("content");
    expect(f.text()).not.toContain("waiting");
  });

  it("fixture.defer.trigger() fires the block without waiting for its triggers", async () => {
    class Page {
      static meta = {
        selector: "app-page",
        template: html`@defer (when never()) { <p>content</p> } @placeholder { <p>waiting</p> }`,
      };
      never = signal(false);
    }
    const f = mount(Page);
    f.defer[0]!.trigger();
    await f.defer[0]!.settle();
    expect(f.text()).toContain("content");
  });

  it("with no trigger given, defaults to idle", async () => {
    vi.useFakeTimers();
    class Page {
      static meta = { selector: "app-page", template: html`@defer { <p>content</p> } @placeholder { <p>waiting</p> }` };
    }
    const f = mount(Page);
    expect(f.defer[0]!.state).toBe("placeholder");
    await vi.advanceTimersByTimeAsync(100);
    expect(f.defer[0]!.state).toBe("complete");
  });

  it("on timer(ms) fires after the delay", async () => {
    vi.useFakeTimers();
    class Page {
      static meta = { selector: "app-page", template: html`@defer (on timer(500)) { <p>content</p> } @placeholder { <p>waiting</p> }` };
    }
    const f = mount(Page);
    await vi.advanceTimersByTimeAsync(499);
    expect(f.defer[0]!.state).toBe("placeholder");
    await vi.advanceTimersByTimeAsync(1);
    expect(f.defer[0]!.state).toBe("complete");
    expect(f.text()).toContain("content");
  });

  it("tears down its timers when the component is destroyed", async () => {
    vi.useFakeTimers();
    class Page {
      static meta = { selector: "app-page", template: html`@defer (on timer(500)) { <p>content</p> }` };
    }
    const f = mount(Page);
    f.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("@defer with lazy() imports", () => {
  it("moves through placeholder, loading and complete", async () => {
    const load = deferred<Record<string, unknown>>();
    class Page {
      static meta = {
        selector: "app-page",
        imports: [lazy(() => load.promise, "Chart")],
        template: html`@defer (when go()) { <app-chart></app-chart> } @placeholder { <i>p</i> } @loading { <i>l</i> } @error { <i>e</i> }`,
      };
      go = signal(false);
    }
    const f = mount(Page);
    const block = f.defer[0]!;
    expect(block.state).toBe("placeholder");
    expect(f.text().trim()).toBe("p");
    f.instance.go.set(true);
    await f.flush();
    expect(block.state).toBe("loading");
    expect(f.text().trim()).toBe("l");
    load.resolve({ Chart });
    await block.settle();
    expect(block.state).toBe("complete");
    expect(f.query("app-chart canvas")).not.toBeNull();
    expect(f.text().trim()).toBe("");
  });

  it("moves to the error state when the import fails", async () => {
    const load = deferred<Record<string, unknown>>();
    class Page {
      static meta = {
        selector: "app-page",
        imports: [lazy(() => load.promise, "Chart")],
        template: html`@defer (when go()) { <app-chart></app-chart> } @loading { <i>l</i> } @error { <i>e</i> }`,
      };
      go = signal(true);
    }
    const f = mount(Page);
    await f.flush();
    expect(f.defer[0]!.state).toBe("loading");
    load.reject(new Error("offline"));
    await f.defer[0]!.settle();
    expect(f.defer[0]!.state).toBe("error");
    expect(f.text().trim()).toBe("e");
  });

  it("errors when the named export is missing", async () => {
    class Page {
      static meta = {
        selector: "app-page",
        imports: [lazy(async () => ({}), "Chart")],
        template: html`@defer (when go()) { <app-chart></app-chart> } @error { <i>e</i> }`,
      };
      go = signal(true);
    }
    const f = mount(Page);
    await f.flush();
    await f.defer[0]!.settle();
    expect(f.defer[0]!.state).toBe("error");
  });

  it("using a lazy component outside @defer is a dev-time error", () => {
    class Page {
      static meta = {
        selector: "app-page",
        imports: [lazy(async () => ({ Chart }), "Chart")],
        template: html`<app-chart></app-chart>`,
      };
    }
    expect(() => mount(Page)).toThrow(/lazy\(\).*@defer/);
  });
});

describe("@defer renderer triggers", () => {
  it("passes non-core triggers to the renderer's observeTrigger", () => {
    const calls: Array<{ name: string; args: unknown[]; placeholder: unknown }> = [];
    let fire!: () => void;
    let disposed = false;
    const renderer = {
      ...createTestRenderer(),
      name: "fancy",
      observeTrigger(name: string, args: unknown[], placeholder: unknown, f: () => void) {
        calls.push({ name, args, placeholder });
        fire = f;
        return () => (disposed = true);
      },
    };
    class Page {
      static meta = {
        selector: "app-page",
        template: html`@defer (on viewport(300)) { <p>content</p> } @placeholder { <p>waiting</p> }`,
      };
    }
    const f = mount(Page, { renderer });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("viewport");
    expect(calls[0]!.args).toEqual([300]);
    expect((calls[0]!.placeholder as { tag: string }).tag).toBe("p");
    fire();
    expect(f.defer[0]!.state).toBe("complete");
    expect(disposed).toBe(true);
  });

  it("an unknown trigger is an error naming the renderer", () => {
    class Page {
      static meta = { selector: "app-page", template: html`@defer (on hover) { <p>content</p> } @placeholder { <p>x</p> }` };
    }
    expect(() => mount(Page, { renderer: { ...createTestRenderer(), name: "test-dom" } })).toThrow(/trigger "hover".*"test-dom"/);
  });

  it("a renderer declaring its trigger list rejects others", () => {
    const renderer = { ...createTestRenderer(), name: "fancy", triggers: ["viewport"], observeTrigger: () => () => {} };
    class Page {
      static meta = { selector: "app-page", template: html`@defer (on hover) { <p>content</p> }` };
    }
    expect(() => mount(Page, { renderer })).toThrow(/trigger "hover".*"fancy".*viewport/);
  });
});
