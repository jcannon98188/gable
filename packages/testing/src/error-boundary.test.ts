import { describe, expect, it } from "vitest";
import { ErrorBoundary, effect, html, signal, viewChild } from "@gable/core";
import { mount } from "@gable/testing";

describe("ErrorBoundary", () => {
  it("shows the fallback on a setup error, still reports it, and resets to rebuilt content", async () => {
    let attempts = 0;
    class Flaky {
      static meta = { selector: "app-flaky", template: html`<b>ok</b>` };
      boom = (() => {
        if (attempts++ === 0) throw new Error("setup boom");
      })();
    }
    class Root {
      static meta = {
        selector: "app-root",
        imports: [ErrorBoundary, Flaky],
        template: html`<gable-error-boundary><app-flaky></app-flaky><p slot="fallback">fallback</p></gable-error-boundary><footer>after</footer>`,
      };
      boundary = viewChild(ErrorBoundary);
    }
    const f = mount(Root);
    expect(f.claimErrors().map((r) => r.context.source)).toEqual(["setup"]);
    await f.flush();
    expect(f.text()).toContain("fallback");
    expect(f.text()).not.toContain("ok");
    expect(f.text()).toContain("after");
    expect((f.instance.boundary()!.error() as Error).message).toBe("setup boom");
    f.instance.boundary()!.reset();
    await f.flush();
    expect(f.text()).toContain("ok");
    expect(f.text()).not.toContain("fallback");
  });

  it("catches an effect error and resets when resetKey changes", async () => {
    class Wild {
      static meta = { selector: "app-wild", template: html`<i>wild</i>` };
      n = signal(0);
      e = effect(() => {
        if (this.n() === 1) throw new Error("effect boom");
      });
    }
    class Root {
      static meta = {
        selector: "app-root",
        imports: [ErrorBoundary, Wild],
        template: html`<gable-error-boundary [resetKey]="key()"><app-wild></app-wild><p slot="fallback">fallback</p></gable-error-boundary>`,
      };
      key = signal(0);
      wild = viewChild(Wild);
    }
    const f = mount(Root);
    f.instance.wild()!.n.set(1);
    await expect(f.flush()).rejects.toThrow("effect boom");
    expect(f.claimErrors().map((r) => [r.context.source, r.context.component])).toEqual([["effect", Wild]]);
    await f.flush();
    expect(f.text()).toContain("fallback");
    expect(f.text()).not.toContain("wild");
    f.instance.key.set(1);
    await f.flush();
    expect(f.text()).toContain("wild");
    expect(f.text()).not.toContain("fallback");
    expect(f.instance.wild()!.n()).toBe(0);
  });

  it("does not trip on event errors by default, and trips when catch includes event", async () => {
    class Clicky {
      static meta = { selector: "app-clicky", template: html`<button (click)="go()">go</button>` };
      go() {
        throw new Error("event boom");
      }
    }
    class Root {
      static meta = {
        selector: "app-root",
        imports: [ErrorBoundary, Clicky],
        template: html`<gable-error-boundary><app-clicky></app-clicky><p slot="fallback">fb1</p></gable-error-boundary><gable-error-boundary [catch]="onEvent"><app-clicky></app-clicky><p slot="fallback">fb2</p></gable-error-boundary>`,
      };
      onEvent = ["event"] as const;
    }
    const f = mount(Root);
    const [a, b] = f.queryAll("button");
    f.dispatch(a!, "click");
    await f.flush().catch(() => {});
    expect(f.claimErrors().map((r) => r.context.source)).toEqual(["event"]);
    expect(f.text()).not.toContain("fb1");
    f.dispatch(b!, "click");
    f.claimErrors();
    await f.flush();
    expect(f.text()).toContain("fb2");
  });

  it("passes a failure inside the fallback to the next boundary up", async () => {
    class Bad {
      static meta = { selector: "app-bad", template: html`` };
      boom = (() => {
        throw new Error("bad");
      })();
    }
    class Root {
      static meta = {
        selector: "app-root",
        imports: [ErrorBoundary, Bad],
        template: html`<gable-error-boundary><p slot="fallback">outer</p><gable-error-boundary><app-bad></app-bad><app-bad slot="fallback"></app-bad></gable-error-boundary></gable-error-boundary>`,
      };
    }
    const f = mount(Root);
    expect(f.claimErrors().length).toBeGreaterThan(0);
    await f.flush().catch(() => {});
    expect(f.claimErrors().length).toBeGreaterThan(0);
    await f.flush();
    expect(f.text()).toContain("outer");
  });
});
