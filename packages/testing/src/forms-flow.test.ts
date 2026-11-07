import { describe, expect, it, vi } from "vitest";
import { Observable, debounceTime, delay, firstValueFrom, of, switchMap, throwError } from "rxjs";
import { html, signal } from "@gable/core";
import { each, form, required, validateAsync } from "@gable/core/forms";
import { mount } from "@gable/testing";

function host<F>(make: () => F) {
  class Host {
    static meta = { selector: "app-host", template: html`<p>host</p>` };
    f = make();
  }
  return mount(Host, { advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)) });
}

describe("async validation", () => {
  const taken = new Set(["ada"]);
  const check = (name$: Observable<string>) =>
    name$.pipe(
      debounceTime(300),
      switchMap((name) => of(taken.has(name) ? { kind: "taken" } : null).pipe(delay(100))),
    );

  it("runs only when sync rules pass, holds pending until it emits, and reports its errors", async () => {
    vi.useFakeTimers();
    try {
      const t = host(() =>
        form(signal({ name: "" }), (p) => {
          required(p.name);
          validateAsync(p.name, check);
        }),
      );
      const f = t.instance.f;
      const name = f.name;
      expect(name.state.pending()).toBe(false);
      name.set("ada");
      await t.flush();
      expect(name.state.pending()).toBe(true);
      expect(name.state.errors()).toEqual([]);
      expect(f.state.valid()).toBe(false);
      await t.advance(300);
      expect(name.state.pending()).toBe(true);
      await t.advance(100);
      expect(name.state.pending()).toBe(false);
      expect(name.state.errors()).toEqual([{ kind: "taken" }]);
      name.set("bob");
      await t.flush();
      expect(name.state.pending()).toBe(true);
      await t.advance(400);
      expect(name.state.errors()).toEqual([]);
      expect(f.state.valid()).toBe(true);
      name.set("");
      await t.flush();
      expect(name.state.pending()).toBe(false);
      expect(name.state.errors()).toEqual([{ kind: "required" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a stream error goes to the ErrorHandler, clears pending and adds asyncFailed; the next value retries", async () => {
    let boom = true;
    const t = host(() =>
      form(signal({ name: "x" }), (p) => {
        validateAsync(p.name, (v$) => v$.pipe(switchMap(() => (boom ? throwError(() => new Error("down")) : of(null)))));
      }),
    );
    const name = t.instance.f.name;
    const reports = t.errors.expect("subscription");
    expect(reports).toHaveLength(1);
    expect((reports[0]!.error as Error).message).toBe("down");
    expect(name.state.pending()).toBe(false);
    expect(name.state.errors()).toEqual([{ kind: "asyncFailed" }]);
    boom = false;
    name.set("y");
    await t.settle();
    expect(name.state.errors()).toEqual([]);
  });

  it("stops its subscription when the owner is destroyed", async () => {
    let subscribed = 0;
    let unsubscribed = 0;
    const t = host(() =>
      form(signal({ name: "x" }), (p) => {
        validateAsync(p.name, (v$) =>
          new Observable<null>((s) => {
            subscribed++;
            const sub = v$.subscribe(() => s.next(null));
            return () => (unsubscribed++, sub.unsubscribe());
          }),
        );
      }),
    );
    await t.settle();
    expect(subscribed).toBe(1);
    t.destroy();
    expect(unsubscribed).toBe(1);
  });
});

describe("submit", () => {
  const make = () =>
    host(() =>
      form(signal({ email: "", pw: "" }), (p) => {
        required(p.email);
      }),
    );

  it("touches every field and does not run the action while invalid", async () => {
    const t = make();
    const action = vi.fn();
    expect(await t.instance.f.submit(action)).toBe("invalid");
    expect(action).not.toHaveBeenCalled();
    expect(t.instance.f.email.state.touched()).toBe(true);
    expect(t.instance.f.pw.state.touched()).toBe(true);
    expect(t.instance.f.state.submitted()).toBe(true);
  });

  it("runs the action with the model when valid and tracks submitting", async () => {
    const t = make();
    const f = t.instance.f;
    f.email.set("a@b.co");
    let release!: () => void;
    const seen: unknown[] = [];
    const run = f.submit(
      (value) =>
        new Promise<void>((resolve) => {
          seen.push(value, f.state.submitting());
          release = resolve;
        }),
    );
    expect(f.state.submitting()).toBe(true);
    expect(await f.submit(() => {})).toBe("busy");
    release();
    expect(await run).toBe("ok");
    expect(f.state.submitting()).toBe(false);
    expect(seen).toEqual([{ email: "a@b.co", pw: "" }, true]);
  });

  it("accepts an Observable action", async () => {
    const t = make();
    t.instance.f.email.set("a@b.co");
    const action = vi.fn(() => of(undefined).pipe(delay(0)));
    vi.useFakeTimers();
    try {
      const run = t.instance.f.submit(action);
      await vi.advanceTimersByTimeAsync(1);
      expect(await run).toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("attaches server errors as ordinary errors, cleared when that field next changes", async () => {
    const t = make();
    const f = t.instance.f;
    f.email.set("a@b.co");
    const result = await f.submit(async () => ({ email: [{ kind: "taken" }] }));
    expect(result).toBe("serverErrors");
    expect(f.email.state.errors()).toEqual([{ kind: "taken" }]);
    expect(f.state.valid()).toBe(false);
    expect(f.state.allErrors()).toEqual([{ path: "email", error: { kind: "taken" } }]);
    f.pw.set("x");
    expect(f.email.state.errors()).toEqual([{ kind: "taken" }]);
    f.email.set("c@d.co");
    expect(f.email.state.errors()).toEqual([]);
  });

  it("reports an action failure to the ErrorHandler", async () => {
    const t = make();
    t.instance.f.email.set("a@b.co");
    expect(await t.instance.f.submit(() => Promise.reject(new Error("500")))).toBe("failed");
    expect(t.instance.f.state.submitting()).toBe(false);
    const reports = t.errors.expect("event");
    expect(reports).toHaveLength(1);
    expect(reports[0]!.context.detail).toBe("submit");
  });

  it("does not run while an async rule is pending", async () => {
    vi.useFakeTimers();
    try {
      const t = host(() => form(signal({ name: "a" }), (p) => validateAsync(p.name, (v$) => v$.pipe(switchMap(() => of(null).pipe(delay(50)))))));
      await t.flush();
      const action = vi.fn();
      expect(await t.instance.f.submit(action)).toBe("invalid");
      await t.advance(50);
      expect(await t.instance.f.submit(action)).toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits the result from submit$ when subscribed", async () => {
    const t = make();
    t.instance.f.email.set("a@b.co");
    const action = vi.fn();
    const out = t.instance.f.submit$(action);
    expect(action).not.toHaveBeenCalled();
    expect(await firstValueFrom(out)).toBe("ok");
    expect(action).toHaveBeenCalledOnce();
  });
});

describe("reset", () => {
  it("restores the baseline and clears touched, submitted and server errors; with a value it rebaselines", async () => {
    const t = host(() => form(signal({ a: "x" })));
    const f = t.instance.f;
    f.a.set("y");
    f.a.state.markTouched();
    await f.submit(async () => ({ a: [{ kind: "bad" }] }));
    expect(f.a.state.errors()).toHaveLength(1);
    f.reset();
    expect(f.a()).toBe("x");
    expect(f.a.state.touched()).toBe(false);
    expect(f.state.submitted()).toBe(false);
    expect(f.a.state.errors()).toEqual([]);
    expect(f.state.dirty()).toBe(false);
    f.reset({ a: "z" });
    expect(f.a()).toBe("z");
    expect(f.state.dirty()).toBe(false);
    f.a.set("x");
    expect(f.state.dirty()).toBe(true);
    f.reset();
    expect(f.a()).toBe("z");
  });
});

describe("array fields", () => {
  const items = () => host(() => form(signal({ items: [{ name: "a" }, { name: "" }] }), (p) => each(p.items, (row) => required(row.name))));

  it("exposes rows with stable keys and per-row rules", () => {
    const f = items().instance.f;
    const rows = f.items.rows();
    expect(rows.map((r) => r.name())).toEqual(["a", ""]);
    expect(new Set(rows.map((r) => r.state.key)).size).toBe(2);
    expect(rows[1]!.name.state.errors()).toEqual([{ kind: "required" }]);
    expect(f.state.allErrors().map((e) => e.path)).toEqual(["items.1.name"]);
    rows[0]!.name.set("aa");
    expect(f.items()[0]).toEqual({ name: "aa" });
  });

  it("keeps row state by key across push, insert, remove and move", () => {
    const f = items().instance.f;
    const [first, second] = f.items.rows();
    first!.name.state.markTouched();
    second!.name.set("b");
    f.items.push({ name: "c" });
    f.items.insert(0, { name: "z" });
    let rows = f.items.rows();
    expect(rows.map((r) => r.name())).toEqual(["z", "a", "b", "c"]);
    expect(rows[1]!.state.key).toBe(first!.state.key);
    expect(rows[1]!.name.state.touched()).toBe(true);
    expect(rows[0]!.name.state.touched()).toBe(false);
    f.items.move(1, 3);
    rows = f.items.rows();
    expect(rows.map((r) => r.name())).toEqual(["z", "b", "c", "a"]);
    expect(rows[3]!.name.state.touched()).toBe(true);
    f.items.remove(0);
    rows = f.items.rows();
    expect(rows.map((r) => r.name())).toEqual(["b", "c", "a"]);
    expect(rows[2]!.state.key).toBe(first!.state.key);
    expect(rows[2]!.name.state.touched()).toBe(true);
    rows[2]!.name.set("A");
    expect(f.items()).toEqual([{ name: "b" }, { name: "c" }, { name: "A" }]);
    f.items.remove(rows[0]!);
    expect(f.items()).toEqual([{ name: "c" }, { name: "A" }]);
  });

  it("tracks dirty per row against the baseline of its key", () => {
    const f = items().instance.f;
    const [first] = f.items.rows();
    expect(f.state.dirty()).toBe(false);
    f.items.push({ name: "new" });
    expect(f.items.rows()[2]!.state.dirty()).toBe(true);
    expect(first!.state.dirty()).toBe(false);
    f.items.move(0, 1);
    expect(first!.state.dirty()).toBe(false);
    expect(f.items.state.dirty()).toBe(true);
  });

  it("renders with @for tracked by row key, keeping DOM nodes with their rows", async () => {
    class List {
      static meta = {
        selector: "app-list",
        template: html`<ul>@for (row of f.items.rows(); track row.state.key) { <li><input [(value)]="row.name" /></li> }</ul>`,
      };
      f = form(signal({ items: [{ name: "a" }, { name: "b" }] }));
    }
    const t = mount(List);
    const [li0, li1] = t.queryAll("li");
    t.instance.f.items.insert(0, { name: "z" });
    await t.flush();
    const lis = t.queryAll("li");
    expect(lis).toHaveLength(3);
    expect(lis[1]).toBe(li0);
    expect(lis[2]).toBe(li1);
    t.instance.f.items.remove(1);
    await t.flush();
    expect(t.queryAll("li")).toHaveLength(2);
    expect(t.queryAll("input").map((i) => i.props.value)).toEqual(["z", "b"]);
  });
});

describe("observable twins", () => {
  it("offers value$ and state.errors$ aligned with the render flush", async () => {
    const t = host(() => form(signal({ a: "" }), (p) => required(p.a)));
    const f = t.instance.f;
    const values: string[] = [];
    const errors: number[] = [];
    f.a.value$.subscribe((v) => values.push(v));
    f.a.state.errors$.subscribe((e) => errors.push(e.length));
    f.a.set("x");
    f.a.set("xy");
    await t.flush();
    expect(values).toEqual(["", "xy"]);
    expect(errors).toEqual([1, 0]);
  });
});
