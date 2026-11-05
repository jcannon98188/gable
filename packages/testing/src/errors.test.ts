import { describe, expect, it, vi } from "vitest";
import { ErrorHandler, effect, html, inject, signal, type ErrorContext } from "@gable/core";
import { mount } from "@gable/testing";
import { Subject } from "rxjs";
import { toSignal } from "@gable/core/rxjs";

describe("setup failures", () => {
  it("reports a failed child Setup, disposes its scope, renders an empty host, and siblings continue", async () => {
    const cleanups: string[] = [];
    const stream = new Subject<number>();
    class Bad {
      static meta = { selector: "app-bad", template: html`<b>never</b>` };
      early = effect(() => void cleanups.push("effect-ran"));
      sub = toSignal(stream);
      boom = (() => {
        throw new Error("setup boom");
      })();
    }
    class Good {
      static meta = { selector: "app-good", template: html`<i>fine</i>` };
    }
    class Root {
      static meta = { selector: "app-root", imports: [Bad, Good], template: html`<app-bad></app-bad><app-good></app-good>` };
    }
    const f = mount(Root);
    expect(f.query("app-bad")?.children.length).toBe(0);
    expect(f.query("app-good")?.children.length).toBe(1);
    expect(stream.observed).toBe(false);
    const [report] = f.claimErrors();
    expect(report!.error).toEqual(new Error("setup boom"));
    expect(report!.context.source).toBe("setup");
    expect(report!.context.component).toBe(Bad);
    expect(report!.context.injector).not.toBeNull();
  });

  it("fails a test on flush when errors are unclaimed", async () => {
    class Bad {
      static meta = { selector: "app-bad", template: html`` };
      boom = (() => {
        throw new Error("unclaimed");
      })();
    }
    class Root {
      static meta = { selector: "app-root", imports: [Bad], template: html`<app-bad></app-bad>` };
    }
    const f = mount(Root);
    await expect(f.flush()).rejects.toThrow("unclaimed");
    await expect(f.flush()).resolves.toBeUndefined(); // reported once
  });

  it("makes a failed root Setup throw from mount", () => {
    class Bad {
      static meta = { selector: "app-bad", template: html`` };
      boom = (() => {
        throw new Error("root boom");
      })();
    }
    expect(() => mount(Bad)).toThrow("root boom");
  });
});

describe("attributed failure sources", () => {
  it("keeps an effect alive after it throws and reports it with the component", async () => {
    class C {
      static meta = { selector: "app-c", template: html`<p>{{ n() }}</p>` };
      n = signal(0);
      runs = 0;
      e = effect(() => {
        if (this.n() === 1) throw new Error("effect boom");
        this.runs++;
      });
    }
    const f = mount(C);
    f.instance.n.set(1);
    await expect(f.flush()).rejects.toThrow("effect boom");
    expect(f.claimErrors().map((r) => [r.context.source, r.context.component])).toEqual([["effect", C]]);
    f.instance.n.set(2);
    await f.flush();
    expect(f.instance.runs).toBe(2);
  });

  it("catches event handler errors, reports them, and never rethrows", () => {
    class C {
      static meta = { selector: "app-c", template: html`<button (click)="go()">x</button>` };
      go() {
        throw new Error("click boom");
      }
    }
    const f = mount(C);
    expect(() => f.dispatch(f.query("button")!, "click")).not.toThrow();
    const [r] = f.claimErrors();
    expect(r!.context).toMatchObject({ source: "event", component: C });
  });

  it("reports rejected Promises returned by handlers", async () => {
    class C {
      static meta = { selector: "app-c", template: html`<button (click)="go()">x</button>` };
      async go() {
        throw new Error("async boom");
      }
    }
    const f = mount(C);
    f.dispatch(f.query("button")!, "click");
    await new Promise((r) => setTimeout(r));
    const [r] = f.claimErrors();
    expect(r!.error).toEqual(new Error("async boom"));
    expect(r!.context.source).toBe("event");
  });

  it("keeps the last good binding value and reports once per failure episode", async () => {
    class C {
      static meta = { selector: "app-c", template: html`<p>{{ read() }}</p>` };
      n = signal(1);
      read() {
        const n = this.n();
        if (n < 0) throw new Error(`bad ${n}`);
        return n;
      }
    }
    const f = mount(C);
    expect(f.text()).toBe("1");
    f.instance.n.set(-1);
    await expect(f.flush()).rejects.toThrow("bad -1");
    f.instance.n.set(-2);
    await f.flush();
    expect(f.text()).toBe("1");
    const first = f.claimErrors();
    expect(first.map((r) => r.context.source)).toEqual(["binding"]);
    f.instance.n.set(5);
    await f.flush();
    expect(f.text()).toBe("5");
    f.instance.n.set(-3);
    await expect(f.flush()).rejects.toThrow("bad -3");
    expect(f.claimErrors()).toHaveLength(1);
  });

  it("renders nothing for a binding that never evaluated cleanly", () => {
    class C {
      static meta = { selector: "app-c", template: html`<p>[{{ read() }}]</p>` };
      read(): number {
        throw new Error("never");
      }
    }
    const f = mount(C);
    expect(f.text()).toBe("");
    expect(f.claimErrors()).toHaveLength(1);
  });
});

describe("the ErrorHandler Token", () => {
  it("can be replaced by providers and receives plain context", () => {
    const seen: Array<[unknown, ErrorContext]> = [];
    class Mine extends ErrorHandler {
      override handleError(error: unknown, context: ErrorContext) {
        seen.push([error, context]);
      }
    }
    class C {
      static meta = { selector: "app-c", template: html`<button (click)="go()">x</button>` };
      go() {
        throw new Error("x");
      }
    }
    const f = mount(C, { providers: [{ provide: ErrorHandler, useClass: Mine }] });
    f.dispatch(f.query("button")!, "click");
    expect(seen).toHaveLength(1);
    expect(f.claimErrors()).toHaveLength(0);
  });

  it("falls back to the console for both errors when the handler throws, without recursion", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    class Bad extends ErrorHandler {
      override handleError(): void {
        calls++;
        throw new Error("handler broke");
      }
    }
    class C {
      static meta = { selector: "app-c", template: html`<button (click)="go()">x</button>` };
      go() {
        throw new Error("original");
      }
    }
    const f = mount(C, { providers: [{ provide: ErrorHandler, useClass: Bad }] });
    f.dispatch(f.query("button")!, "click");
    expect(calls).toBe(1);
    const logged = spy.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("original");
    expect(logged).toContain("handler broke");
    spy.mockRestore();
  });

  it("logs and swallows by default outside the harness", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    new ErrorHandler().handleError(new Error("e"), { source: "event", injector: null });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
    void inject;
  });
});
