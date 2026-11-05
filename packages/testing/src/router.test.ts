import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { RouterOutlet, type Route } from "@gable/core/router";
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
