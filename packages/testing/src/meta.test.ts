import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { Meta } from "@gable/core/renderer";
import { RouterOutlet, type Route } from "@gable/core/router";
import { mountApp } from "@gable/testing";

class Page {
  static meta = { selector: "app-page", template: html`<p>page</p>` };
}
class Root {
  static meta = { selector: "app-root", imports: [RouterOutlet], template: html`<router-outlet></router-outlet>` };
}

const routes: Route[] = [
  {
    path: "",
    meta: { robots: "index", og: { site_name: "Gable" } },
    children: [
      { path: "", component: Page },
      {
        path: "post",
        component: Page,
        meta: { description: "A post", canonical: "https://x.test/post", themeColor: "#000", og: { title: "Post" }, twitter: { card: "summary" } },
      },
      { path: "other", component: Page, meta: { robots: "noindex" } },
    ],
  },
];

describe("route meta", () => {
  it("applies the merged meta of the matched routes", async () => {
    const app = mountApp(Root, { routes, url: "/post" });
    await app.settle();
    expect(app.meta.get()).toEqual({
      robots: "index",
      description: "A post",
      canonical: "https://x.test/post",
      themeColor: "#000",
      og: { site_name: "Gable", title: "Post" },
      twitter: { card: "summary" },
    });
    expect(app.meta.entries).toContainEqual({ kind: "link", key: "canonical", value: "https://x.test/post" });
    expect(app.meta.entries).toContainEqual({ kind: "property", key: "og:title", value: "Post" });
    expect(app.meta.entries).toContainEqual({ kind: "name", key: "twitter:card", value: "summary" });
  });

  it("resets on navigation and drops tags the next route does not declare", async () => {
    const app = mountApp(Root, { routes, url: "/post" });
    await app.settle();
    await app.navigate("/other");
    expect(app.meta.get()).toEqual({ robots: "noindex", og: { site_name: "Gable" } });
    await app.navigate("/");
    expect(app.meta.get()).toEqual({ robots: "index", og: { site_name: "Gable" } });
  });

  it("tags set from code are reset by the next navigation", async () => {
    const app = mountApp(Root, { routes, url: "/" });
    await app.settle();
    app.injector.get(Meta)!.update({ description: "dynamic" });
    expect(app.meta.get().description).toBe("dynamic");
    await app.navigate("/other");
    expect(app.meta.get().description).toBeUndefined();
  });
});
