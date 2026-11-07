import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { currentScope, holdRemoval } from "@gable/core/internal";
import { mount } from "@gable/testing";

/** A component that keeps its branch mounted until its gate is released (what an exit animation does). */
const gates: Array<() => void> = [];
class Holder {
  static meta = { selector: "[holder]" };
  _ = (() => {
    currentScope()?.onDispose(() => {
      let release!: () => void;
      const p = new Promise<void>((r) => (release = r));
      if (holdRemoval(p)) gates.push(release);
    });
  })();
}

class App {
  static meta = {
    selector: "app-root",
    imports: [Holder],
    template: html`
      @if (show()) {
        <p holder>held</p>
      }
      @switch (which()) {
        @case ("a") {
          <b holder>a</b>
        }
        @case ("b") {
          <i>b</i>
        }
      }
      @for (n of items(); track n) {
        <li holder>{{ n }}</li>
      }
    `,
  };
  show = signal(true);
  which = signal("a");
  items = signal([1, 2]);
}

describe("holdRemoval", () => {
  it("keeps @if nodes until the promise settles, then removes them", async () => {
    gates.length = 0;
    const f = mount(App);
    f.instance.show.set(false);
    await f.flush();
    expect(f.queryAll("p")).toHaveLength(1);
    expect(gates).toHaveLength(1);
    gates[0]!();
    await f.settle();
    expect(f.queryAll("p")).toHaveLength(0);
  });

  it("holds @switch cases and @for rows", async () => {
    gates.length = 0;
    const f = mount(App);
    f.instance.which.set("b");
    f.instance.items.set([2]);
    await f.flush();
    expect(f.queryAll("b")).toHaveLength(1);
    expect(f.queryAll("li")).toHaveLength(2);
    expect(gates).toHaveLength(2);
    for (const g of gates) g();
    await f.settle();
    expect(f.queryAll("b")).toHaveLength(0);
    expect(f.queryAll("li")).toHaveLength(1);
  });

  it("removes at once when nothing holds", async () => {
    const f = mount(App);
    f.instance.which.set("b");
    await f.flush();
    f.instance.which.set("a");
    await f.flush();
    expect(f.queryAll("i")).toHaveLength(0);
  });

  it("returns false outside control-flow removal (a whole-app teardown has nothing to hold)", async () => {
    expect(holdRemoval(Promise.resolve())).toBe(false);
    gates.length = 0;
    const f = mount(App);
    f.destroy();
    expect(gates).toHaveLength(0);
  });

  it("a rejected hold still removes the nodes", async () => {
    let fail!: () => void;
    class Failing {
      static meta = { selector: "[failing]" };
      _ = (() => {
        currentScope()?.onDispose(() => {
          holdRemoval(new Promise((_, reject) => (fail = () => reject(new Error("x")))));
        });
      })();
    }
    class A {
      static meta = { selector: "app-a", imports: [Failing], template: html`@if (on()) {<p failing>x</p>}` };
      on = signal(true);
    }
    const f = mount(A);
    f.instance.on.set(false);
    await f.flush();
    expect(f.queryAll("p")).toHaveLength(1);
    fail();
    await f.settle();
    expect(f.queryAll("p")).toHaveLength(0);
  });
});
