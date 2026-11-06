import { describe, expect, it } from "vitest";
import { BehaviorSubject, Subject, observeOn } from "rxjs";
import { html, signal } from "@gable/core";
import { output, renderScheduler, toObservable, toSignal } from "@gable/core/rxjs";
import { mount } from "@gable/testing";


describe("toSignal", () => {
  it("delivers emissions to the view within one coalesced flush", async () => {
    const subject = new Subject<number>();
    class C {
      static meta = { selector: "app-c", template: html`<p>{{ n() }}</p>` };
      n = toSignal(subject);
    }
    const f = mount(C);
    expect(f.text()).toBe("");
    subject.next(1);
    subject.next(2);
    subject.next(3);
    expect(f.text()).toBe("");
    await f.flush();
    expect(f.text()).toBe("3");
  });

  it("starts at initialValue when given", async () => {
    const subject = new Subject<string>();
    class C {
      static meta = { selector: "app-c", template: html`<p>{{ s() }}</p>` };
      s = toSignal(subject, { initialValue: "none" });
    }
    const f = mount(C);
    expect(f.text()).toBe("none");
    subject.next("x");
    await f.flush();
    expect(f.text()).toBe("x");
  });

  it("unsubscribes when the scope is destroyed", () => {
    const subject = new Subject<number>();
    class C {
      static meta = { selector: "app-c", template: html`<p></p>` };
      n = toSignal(subject);
    }
    const f = mount(C);
    expect(subject.observed).toBe(true);
    f.destroy();
    expect(subject.observed).toBe(false);
  });

  it("reports a stream error without throwing and keeps the last value", async () => {
    const subject = new Subject<number>();
    class C {
      static meta = { selector: "app-c", template: html`<p>{{ n() }}</p>` };
      n = toSignal(subject);
    }
    const f = mount(C);
    subject.next(5);
    subject.error(new Error("boom"));
    await expect(f.flush()).rejects.toThrow("boom");
    expect(f.claimErrors().map((r) => [r.error, r.context.source])).toEqual([[new Error("boom"), "subscription"]]);
    expect(f.text()).toBe("5");
    expect(f.instance.n()).toBe(5);
  });

  it("keeps the last value after completion", async () => {
    const subject = new Subject<number>();
    class C {
      static meta = { selector: "app-c", template: html`<p>{{ n() }}</p>` };
      n = toSignal(subject);
    }
    const f = mount(C);
    subject.next(7);
    subject.complete();
    await f.flush();
    expect(f.text()).toBe("7");
    expect(f.claimErrors()).toEqual([]);
  });

  it("treats a Promise as a single-emission Observable", async () => {
    class C {
      static meta = { selector: "app-c", template: html`<p>{{ n() }}</p>` };
      n = toSignal(Promise.resolve(42));
    }
    const f = mount(C);
    await Promise.resolve();
    await f.flush();
    expect(f.text()).toBe("42");
  });

  it("reports a rejected Promise", async () => {
    class C {
      static meta = { selector: "app-c", template: html`<p></p>` };
      n = toSignal(Promise.reject(new Error("no")));
    }
    const f = mount(C);
    await new Promise((r) => setTimeout(r));
    expect(f.claimErrors().map((r) => r.error)).toEqual([new Error("no")]);
  });

  it("throws outside a scope unless { manual } is given", () => {
    const subject = new BehaviorSubject(1);
    expect(() => toSignal(subject)).toThrow(/setup/);
    const s = toSignal(subject, { manual: true });
    expect(s()).toBe(1);
    subject.next(2);
    expect(s()).toBe(2);
  });
});

describe("toObservable", () => {
  it("emits the current value, then settled values after each flush", async () => {
    const seen: number[] = [];
    class C {
      static meta = { selector: "app-c", template: html`<p></p>` };
      n = signal(1);
      stream = toObservable(this.n);
    }
    const f = mount(C);
    f.instance.stream.subscribe((v) => seen.push(v));
    expect(seen).toEqual([1]);
    f.instance.n.set(2);
    f.instance.n.set(3);
    expect(seen).toEqual([1]);
    await f.flush();
    expect(seen).toEqual([1, 3]);
    f.instance.n.set(4);
    await f.flush();
    expect(seen).toEqual([1, 3, 4]);
  });

  it("stops emitting after unsubscribe", async () => {
    const seen: number[] = [];
    const n = signal(1);
    class C {
      static meta = { selector: "app-c", template: html`<p></p>` };
      stream = toObservable(n);
    }
    const f = mount(C);
    const sub = f.instance.stream.subscribe((v) => seen.push(v));
    sub.unsubscribe();
    n.set(2);
    await f.flush();
    expect(seen).toEqual([1]);
  });

  it("shares one effect between subscribers; each sees its own sequence and unsubscribes independently", async () => {
    const a: number[] = [];
    const b: number[] = [];
    const n = signal(1);
    class C {
      static meta = { selector: "app-c", template: html`<p></p>` };
      stream = toObservable(n);
    }
    const f = mount(C);
    const subA = f.instance.stream.subscribe((v) => a.push(v));
    n.set(2);
    f.instance.stream.subscribe((v) => b.push(v)); // joins before the flush: sees the current value
    await f.flush();
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([2]);
    subA.unsubscribe();
    n.set(3);
    await f.flush();
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([2, 3]);
  });

  it("resubscribing after the last subscriber left starts afresh", async () => {
    const seen: number[] = [];
    const n = signal(1);
    class C {
      static meta = { selector: "app-c", template: html`<p></p>` };
      stream = toObservable(n);
    }
    const f = mount(C);
    f.instance.stream.subscribe(() => {}).unsubscribe();
    n.set(2);
    f.instance.stream.subscribe((v) => seen.push(v));
    n.set(3);
    await f.flush();
    expect(seen).toEqual([2, 3]);
  });
});
