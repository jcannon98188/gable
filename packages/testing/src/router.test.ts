import { describe, expect, it } from "vitest";
import { computed, html, inject, input, lazy, signal } from "@gable/core";
import { ActiveRoute, RouterLink, RouterLinkActive, RouterOutlet, redirect, type Route } from "@gable/core/router";
import { firstValueFrom } from "rxjs";
import { mountApp } from "@gable/testing";

class Home {
  static meta = { selector: "app-home", template: html`<h1>Home</h1>` };
}
class About {
  static meta = { selector: "app-about", template: html`<h1>About</h1>` };
}
class Root {
  static meta = { selector: "app-root", imports: [RouterOutlet], template: html`<router-outlet></router-outlet>` };
}

const routes: Route[] = [
  { path: "", component: Home },
  { path: "about", component: About },
];

describe("navigation", () => {
  it("renders the route matching the initial URL in the outlet", async () => {
    const app = mountApp(Root, { routes, url: "/about" });
    await app.settle();
    expect(app.text()).toBe("About");
  });

  it("navigate resolves with the outcome, swaps the view and updates the location", async () => {
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    expect(app.text()).toBe("Home");
    const outcome = await app.navigate("/about");
    expect(outcome).toEqual({ status: "success", url: "/about" });
    expect(app.text()).toBe("About");
    expect(app.location.url).toBe("/about");
    expect(app.history.entries).toEqual(["/", "/about"]);
  });

  it("an unmatched URL reports a router error and resolves with an error outcome", async () => {
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    const outcome = await app.navigate("/nope");
    expect(outcome.status).toBe("error");
    expect(app.errors.expect("router")).toHaveLength(1);
    expect(app.text()).toBe("Home");
  });

  it("follows the browser's back button", async () => {
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    await app.navigate("/about");
    app.history.back();
    await app.settle();
    expect(app.text()).toBe("Home");
    expect(app.history.entries).toEqual(["/", "/about"]);
  });
});

// --- params, nesting, state -------------------------------------------------

class User {
  static meta = { selector: "app-user", template: html`<p>user {{ id() }}</p>` };
  id = input.required<string>();
}
class Layout {
  static meta = { selector: "app-layout", imports: [RouterOutlet], template: html`<nav>layout</nav><router-outlet></router-outlet>` };
}

describe("params and nesting", () => {
  it("binds route params to matching inputs, and keeps the instance when only params change", async () => {
    const app = mountApp(Root, { routes: [{ path: "users/:id", component: User }], url: "/users/4" });
    await app.settle();
    expect(app.text()).toBe("user 4");
    const node = app.query("app-user");
    await app.navigate("/users/9");
    expect(app.text()).toBe("user 9");
    expect(app.query("app-user")).toBe(node);
  });

  it("renders nested routes in nested outlets and keeps the parent when the child changes", async () => {
    const routes: Route[] = [{ path: "app", component: Layout, children: [{ path: "", component: Home }, { path: "about", component: About }] }];
    const app = mountApp(Root, { routes, url: "/app" });
    await app.settle();
    expect(app.text()).toBe("layoutHome");
    const layout = app.query("app-layout");
    await app.navigate("/app/about");
    expect(app.text()).toBe("layoutAbout");
    expect(app.query("app-layout")).toBe(layout);
  });

  it("a route without a component lets its children render in the parent's outlet", async () => {
    const routes: Route[] = [{ path: "admin", children: [{ path: "users/:id", component: User }] }];
    const app = mountApp(Root, { routes, url: "/admin/users/3" });
    await app.settle();
    expect(app.text()).toBe("user 3");
  });

  it("wildcard matches the rest; the first matching route wins", async () => {
    const routes: Route[] = [{ path: "about", component: About }, { path: "**", component: Home }];
    const app = mountApp(Root, { routes, url: "/about" });
    await app.settle();
    expect(app.text()).toBe("About");
    await app.navigate("/anything/else");
    expect(app.text()).toBe("Home");
  });

  it("exposes url, params, queryParams, fragment, data and navigating as signals and Observables", async () => {
    const routes: Route[] = [{ path: "", component: Home }, { path: "users/:id", component: User, data: { section: "people" }, title: "People" }];
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    const { router } = app;
    const flags: boolean[] = [];
    const sub = router.navigating$.subscribe((v) => flags.push(v));
    await app.navigate("/users/7?tab=a&tab=b&x=1#top");
    expect(router.url()).toBe("/users/7?tab=a&tab=b&x=1#top");
    expect(router.params()).toEqual({ id: "7" });
    expect(router.queryParams()).toEqual({ tab: ["a", "b"], x: "1" });
    expect(router.fragment()).toBe("top");
    expect(router.data()).toEqual({ section: "people" });
    expect(router.navigating()).toBe(false);
    expect(await firstValueFrom(router.params$)).toEqual({ id: "7" });
    expect(await firstValueFrom(router.url$)).toBe("/users/7?tab=a&tab=b&x=1#top");
    expect(app.title.get()).toBe("People");
    await app.settle();
    expect(flags).toContain(true);
    expect(flags.at(-1)).toBe(false);
    sub.unsubscribe();
  });

  it("inject(ActiveRoute) gives a routed component its own params and data", async () => {
    class Probe {
      static meta = { selector: "app-probe", template: html`<p>{{ route.params().id }}/{{ route.data().kind }}</p>` };
      route = inject(ActiveRoute);
    }
    const routes: Route[] = [{ path: "p/:id", component: Probe, data: { kind: "k" } }];
    const app = mountApp(Root, { routes, url: "/p/1" });
    await app.settle();
    expect(app.text()).toBe("1/k");
  });

  it("route providers create an injector for the routed component", async () => {
    class Secret {
      value = "s3";
    }
    class Uses {
      static meta = { selector: "app-uses", template: html`<p>{{ s.value }}</p>` };
      s = inject(Secret);
    }
    const app = mountApp(Root, { routes: [{ path: "", component: Uses, providers: [Secret] }] });
    await app.settle();
    expect(app.text()).toBe("s3");
  });

  it("emits navigation events", async () => {
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    const seen: string[] = [];
    app.router.events$.subscribe((e) => seen.push(e.type));
    await app.navigate("/about");
    expect(seen).toEqual(["start", "end"]);
  });
});


// --- redirects and guards ----------------------------------------------------

describe("redirects", () => {
  it("redirectTo sends the navigation elsewhere, with params carried over", async () => {
    const routes: Route[] = [
      { path: "", redirectTo: "/about" },
      { path: "u/:id", redirectTo: "/users/:id" },
      { path: "users/:id", component: User },
      { path: "about", component: About },
    ];
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    expect(app.text()).toBe("About");
    expect(app.location.url).toBe("/about");
    expect(app.history.entries).toEqual(["/about"]);
    const outcome = await app.navigate("/u/5");
    expect(outcome).toEqual({ status: "success", url: "/users/5" });
    expect(app.text()).toBe("user 5");
    expect(app.location.url).toBe("/users/5");
  });

  it("a redirect loop ends in a reported router error", async () => {
    const routes: Route[] = [{ path: "", component: Home }, { path: "a", redirectTo: "/b" }, { path: "b", redirectTo: "/a" }];
    const app = mountApp(Root, { routes });
    await app.settle();
    const outcome = await app.navigate("/a");
    expect(outcome.status).toBe("error");
    expect(app.errors.expect("router")).toHaveLength(1);
  });
});

describe("guards", () => {
  class Auth {
    loggedIn = signal(false);
  }

  it("canActivate false cancels the navigation and leaves the view and URL alone", async () => {
    const routes: Route[] = [{ path: "", component: Home }, { path: "admin", component: About, canActivate: [() => false] }];
    const app = mountApp(Root, { routes });
    await app.settle();
    const outcome = await app.navigate("/admin");
    expect(outcome).toEqual({ status: "cancelled", url: "/admin", reason: "guard" });
    expect(app.text()).toBe("Home");
    expect(app.location.url).toBe("/");
  });

  it("guards run in an injection context and may be async; a redirect result navigates elsewhere", async () => {
    const guard = async () => (inject(Auth).loggedIn() ? true : redirect("/login"));
    const routes: Route[] = [
      { path: "", component: Home },
      { path: "login", component: About },
      { path: "admin", component: Layout, canActivate: [guard] },
    ];
    const app = mountApp(Root, { routes, providers: [Auth] });
    await app.settle();
    const outcome = await app.navigate("/admin");
    expect(outcome).toEqual({ status: "success", url: "/login" });
    expect(app.text()).toBe("About");
    app.injector.get(Auth)!.loggedIn.set(true);
    expect(await app.navigate("/admin")).toEqual({ status: "success", url: "/admin" });
    expect(app.text()).toBe("layout");
  });

  it("guards may return an Observable", async () => {
    const { of } = await import("rxjs");
    const routes: Route[] = [{ path: "", component: Home }, { path: "x", component: About, canActivate: [() => of(true)] }];
    const app = mountApp(Root, { routes });
    await app.settle();
    expect((await app.navigate("/x")).status).toBe("success");
  });

  it("canMatch false lets matching fall through to the next route", async () => {
    const routes: Route[] = [
      { path: "page", component: About, canMatch: [() => false] },
      { path: "page", component: Home },
    ];
    const app = mountApp(Root, { routes, url: "/page" });
    await app.settle();
    expect(app.text()).toBe("Home");
  });

  it("canDeactivate receives the leaving component and can veto", async () => {
    let allow = false;
    const seen: unknown[] = [];
    const routes: Route[] = [
      { path: "", component: Home, canDeactivate: [(component) => (seen.push(component), allow)] },
      { path: "about", component: About },
    ];
    const app = mountApp(Root, { routes });
    await app.settle();
    expect((await app.navigate("/about")).status).toBe("cancelled");
    expect(app.text()).toBe("Home");
    expect(seen[0]).toBeInstanceOf(Home);
    allow = true;
    expect((await app.navigate("/about")).status).toBe("success");
  });

  it("a newer navigation supersedes one waiting on a guard", async () => {
    let release!: (v: boolean) => void;
    const slow = new Promise<boolean>((r) => (release = r));
    const routes: Route[] = [{ path: "", component: Home }, { path: "slow", component: User, canActivate: [() => slow] }, { path: "about", component: About }];
    const app = mountApp(Root, { routes });
    await app.settle();
    const first = app.navigate("/slow");
    const second = await app.navigate("/about");
    release(true);
    expect((await first).status).toBe("cancelled");
    expect(second.status).toBe("success");
    expect(app.text()).toBe("About");
  });

  it("a throwing guard reports a router error and resolves with an error outcome", async () => {
    const routes: Route[] = [{ path: "", component: Home }, { path: "x", component: About, canActivate: [() => { throw new Error("boom"); }] }];
    const app = mountApp(Root, { routes });
    await app.settle();
    const outcome = await app.navigate("/x");
    expect(outcome.status).toBe("error");
    expect(app.errors.expect("router").map((r) => String((r.error as Error).message))).toEqual(["boom"]);
    expect(app.text()).toBe("Home");
  });
});

// --- lazy routes -------------------------------------------------------------

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("lazy routes", () => {
  it("loads a lazy component on navigation, with the same lazy() as @defer", async () => {
    const gate = deferred<Record<string, unknown>>();
    const routes: Route[] = [{ path: "", component: Home }, { path: "about", component: lazy(() => gate.promise, "About") }];
    const app = mountApp(Root, { routes });
    await app.settle();
    const pending = app.navigate("/about");
    await app.flush();
    expect(app.text()).toBe("Home");
    expect(app.router.navigating()).toBe(true);
    gate.resolve({ About });
    expect(await pending).toEqual({ status: "success", url: "/about" });
    expect(app.text()).toBe("About");
  });

  it("loads lazy children to match them", async () => {
    const childRoutes: Route[] = [{ path: "", component: Home }, { path: ":id", component: User }];
    const routes: Route[] = [{ path: "users", children: lazy(async () => ({ userRoutes: childRoutes }), "userRoutes") }];
    const app = mountApp(Root, { routes, url: "/users/8" });
    await app.settle();
    expect(app.text()).toBe("user 8");
  });

  it("a failed lazy component load cancels the navigation and reports to the error handler, then can retry", async () => {
    let fail = true;
    const loader = async () => {
      if (fail) throw new Error("offline");
      return { About };
    };
    const routes: Route[] = [{ path: "", component: Home }, { path: "about", component: lazy(loader, "About") }];
    const app = mountApp(Root, { routes });
    await app.settle();
    const outcome = await app.navigate("/about");
    expect(outcome).toEqual({ status: "cancelled", url: "/about", reason: "lazy-load-failed" });
    expect(app.text()).toBe("Home");
    expect(app.location.url).toBe("/");
    const reports = app.errors.expect("lazy");
    expect(reports).toHaveLength(1);
    expect(String(reports[0]!.error)).toMatch(/offline/);
    fail = false;
    expect((await app.navigate("/about")).status).toBe("success");
    expect(app.text()).toBe("About");
  });

  it("a failed lazy children load cancels the navigation too", async () => {
    const routes: Route[] = [{ path: "", component: Home }, { path: "x", children: lazy(async () => { throw new Error("nope"); }, "r") }];
    const app = mountApp(Root, { routes });
    await app.settle();
    expect((await app.navigate("/x/y")).status).toBe("cancelled");
    expect(app.errors.expect("lazy")).toHaveLength(1);
    expect(app.text()).toBe("Home");
  });
});

// --- links -------------------------------------------------------------------

describe("routerLink", () => {
  class Nav {
    static meta = {
      selector: "app-nav",
      imports: [RouterLink, RouterLinkActive, RouterOutlet],
      template: html`
        <a id="home" routerLink="/" routerLinkActive="on" routerLinkActiveExact="true">home</a>
        <a id="about" routerLink="/about" routerLinkActive="on">about</a>
        <a id="user" [routerLink]="userLink()">user</a>
        <router-outlet></router-outlet>
      `,
    };
    uid = signal(3);
    userLink = computed(() => ["/users", this.uid()]);
  }

  it("sets href, navigates on click without a page load, and marks the active link", async () => {
    const app = mountApp(Nav, { routes: [{ path: "", component: Home }, { path: "about", component: About }, { path: "users/:id", component: User }] });
    await app.settle();
    expect(app.query("#about")!.attrs.href).toBe("/about");
    expect(app.query("#user")!.attrs.href).toBe("/users/3");
    expect(app.query("#home")!.classes).toContain("on");
    expect(app.query("#about")!.classes).not.toContain("on");
    let prevented = false;
    app.dispatch(app.query("#about")!, "click", { button: 0, preventDefault: () => (prevented = true) });
    await app.settle();
    expect(prevented).toBe(true);
    expect(app.location.url).toBe("/about");
    expect(app.text()).toContain("About");
    expect(app.query("#about")!.classes).toContain("on");
    expect(app.query("#home")!.classes).not.toContain("on");
  });

  it("leaves modified clicks to the browser", async () => {
    const app = mountApp(Nav, { routes: [{ path: "", component: Home }, { path: "about", component: About }] });
    await app.settle();
    app.dispatch(app.query("#about")!, "click", { button: 0, ctrlKey: true });
    await app.settle();
    expect(app.location.url).toBe("/");
  });

  it("follows a signal-driven segment array", async () => {
    const app = mountApp(Nav, { routes: [{ path: "", component: Home }, { path: "users/:id", component: User }] });
    await app.settle();
    app.instance.uid.set(11);
    await app.flush();
    expect(app.query("#user")!.attrs.href).toBe("/users/11");
  });
});
