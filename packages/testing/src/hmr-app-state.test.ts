import { describe, expect, it } from "vitest";
import { html, inject, input, signal } from "@gable/core";
import { form, minLength, required } from "@gable/core/forms";
import { RouterOutlet, type Route } from "@gable/core/router";
import { mount, mountApp } from "@gable/testing";

// TASK-2.15: Form state, router state and route injectors survive hot updates.

describe("form state across a re-setup", () => {
  const v1 = () =>
    class Signup {
      static meta = { selector: "app-signup", template: html`<input class="name" [field]="f.name" /><p class="err">{{ f.name.state.errors().length }}</p><p class="dirty">{{ f.state.dirty() }}</p><p class="t">{{ f.name.state.touched() }}</p>` };
      f = form(signal({ name: "ann" }), (p) => required(p.name));
    };
  const v2 = () =>
    class Signup {
      static meta = { selector: "app-signup", template: html`<input class="name" [field]="f.name" /><p class="err">{{ f.name.state.errors().length }}</p><p class="dirty">{{ f.state.dirty() }}</p><p class="t">{{ f.name.state.touched() }}</p>` };
      extra = 1;
      f = form(signal({ name: "ann" }), (p) => {
        required(p.name);
        minLength(p.name, 5);
      });
    };

  it("keeps value, touched and dirty baseline, and runs the edited schema", async () => {
    const f = mount(v1());
    f.fill(f.query(".name")!, "bob");
    f.blur(f.query(".name")!);
    await f.settle();
    expect(f.text()).toContain("true");
    const result = f.hotReplace(v2());
    expect(result.status).toBe("applied");
    await f.settle();
    expect(f.instance.f.name()).toBe("bob");
    expect(f.instance.f.name.state.touched()).toBe(true);
    expect(f.instance.f.state.dirty()).toBe(true); // baseline stayed "ann"
    expect(f.instance.f.name.state.errors().map((e) => e.kind)).toEqual(["minLength"]);
    f.instance.f.reset();
    expect(f.instance.f.name()).toBe("ann");
  });

  it("keeps touched state and baselines of array rows, and drops removed paths", async () => {
    const mk = (extra: boolean) =>
      class List {
        static meta = { selector: "app-list", template: html`x` };
        extra = extra ? 1 : 0;
        f = form(signal({ tags: [{ v: "a" }, { v: "b" }] }));
      };
    const f = mount(mk(false));
    f.instance.f.tags.rows()[1]!.v.state.markTouched();
    f.instance.f.tags.push({ v: "c" });
    f.hotReplace(mk(true));
    const rows = f.instance.f.tags.rows();
    expect(rows.map((r) => r.v())).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.v.state.touched())).toEqual([false, true, false]);
    expect(rows.map((r) => r.v.state.dirty())).toEqual([false, false, true]);
  });
});

describe("router state across hot updates", () => {
  class Shell {
    static meta = { selector: "app-shell", imports: [RouterOutlet], template: html`<router-outlet></router-outlet>` };
  }
  const tally = () =>
    class Tally {
      n = signal(0);
    };
  const page = (Tally: ReturnType<typeof tally>, label: "v1" | "v2") => {
    const template = label === "v1" ? html`<b>v1</b> id={{ id() }} own={{ own() }} svc={{ tally.n() }}<i (click)="bump()"></i>` : html`<b>v2</b> id={{ id() }} own={{ own() }} svc={{ tally.n() }}<i (click)="bump()"></i>`;
    return class Page {
      static meta = { selector: "app-page", template };
      id = input("");
      tally = inject(Tally);
      own = signal(0);
      extra = label === "v2" ? 1 : 0;
      bump() {
        this.own.update((n) => n + 1);
        this.tally.n.update((n) => n + 1);
      }
    };
  };

  it("a routed component edit keeps URL, params, own state and the route injector's services", async () => {
    const Tally = tally();
    const app = mountApp(Shell, { routes: [{ path: "p/:id", component: page(Tally, "v1"), providers: [Tally] }], url: "/p/7" });
    await app.settle();
    app.dispatch(app.query("i")!, "click");
    app.dispatch(app.query("i")!, "click");
    await app.settle();
    expect(app.text()).toBe("v1 id=7 own=2 svc=2");
    expect(app.hotReplace(page(Tally, "v2")).status).toBe("applied");
    await app.settle();
    expect(app.text()).toBe("v2 id=7 own=2 svc=2");
    expect(app.router.url()).toBe("/p/7");
    expect(app.history.entries).toEqual(["/p/7"]);
  });

  it("an edited route-provided service keeps its state", async () => {
    const Tally = tally();
    const app = mountApp(Shell, { routes: [{ path: "p/:id", component: page(Tally, "v1"), providers: [Tally] }], url: "/p/7" });
    await app.settle();
    app.dispatch(app.query("i")!, "click");
    await app.settle();
    const Next = class Tally {
      n = signal(0);
      added = 1;
    };
    expect(app.hotReplace(Next).status).toBe("applied");
    await app.settle();
    expect(app.text()).toBe("v1 id=7 own=1 svc=1");
  });

  describe("an edited route config", () => {
    const setup = async () => {
      const Tally = tally();
      const Page = page(Tally, "v1");
      class Other {
        static meta = { selector: "app-other", template: html`other` };
      }
      const old: Route[] = [{ path: "p/:id", component: Page, providers: [Tally], data: { v: 1 } }];
      const app = mountApp(Shell, { routes: old, url: "/p/7?q=1" });
      await app.settle();
      app.dispatch(app.query("i")!, "click");
      await app.settle();
      return { app, Tally, Page, Other };
    };

    it("is re-matched against the current URL; the routed instance, its injector and the URL stay", async () => {
      const { app, Tally, Page, Other } = await setup();
      const events: string[] = [];
      app.router.events$.subscribe((e) => events.push(e.type));
      const edited: Route[] = [
        { path: "other", component: Other },
        { path: "p/:id", component: Page, providers: [Tally], data: { v: 2 }, title: "Edited" },
      ];
      app.hotReplace({ routes: edited });
      await app.settle();
      expect(app.text()).toBe("v1 id=7 own=1 svc=1");
      expect(app.router.data()).toEqual({ v: 2 });
      expect(app.title.get()).toBe("Edited");
      expect(app.router.url()).toBe("/p/7?q=1");
      expect(events).toEqual([]);
      expect(app.history.entries).toEqual(["/p/7?q=1"]);
      // the new config is the live one
      expect((await app.navigate("/other")).status).toBe("success");
      expect(app.text()).toBe("other");
    });

    it("a config that no longer matches the URL keeps the old config and reports", async () => {
      const { app, Other } = await setup();
      app.hotReplace({ routes: [{ path: "other", component: Other }] satisfies Route[] });
      await app.router.whenIdle();
      const reports = app.errors.expect("hmr");
      expect(reports).toHaveLength(1);
      expect(String(reports[0]!.error)).toContain("/p/7");
      expect(app.text()).toBe("v1 id=7 own=1 svc=1");
      expect((await app.navigate("/p/9")).status).toBe("success");
      expect((await app.navigate("/other")).status).toBe("error");
      app.errors.expect("router");
    });
  });
});
