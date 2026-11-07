import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits, editRouteConfig, listComponents, locateRouteConfig, planRouteEdit } from "./server/route-config.js";

const TODOMVC = `import type { Route } from '@gable/core/router';

/** \`#/\`, \`#/active\` and \`#/completed\`. The filter rides along as route data. */
export const routes: Route[] = [
  { path: '', data: { filter: 'all' } },
  { path: 'active', data: { filter: 'active' } },
  { path: 'completed', data: { filter: 'completed' } },
  { path: '**', redirectTo: '/' },
];
`;

const edit = (text: string, e: Parameters<typeof planRouteEdit>[2]) => applyTextEdits(text, planRouteEdit("routes.ts", text, e));

describe("route config patches", () => {
  it("adds a route before the trailing catch-all and touches nothing else", () => {
    const out = edit(TODOMVC, { op: "add", parent: [], route: { path: 'about', title: 'About' } });
    expect(out).toBe(TODOMVC.replace("  { path: '**'", "  { path: 'about', title: 'About' },\n  { path: '**'"));
  });

  it("appends when there is no catch-all, and keeps a missing trailing comma missing", () => {
    const text = `import type { Route } from '@gable/core/router';\nexport const routes: Route[] = [\n  { path: '' },\n  { path: 'a' }\n];\n`;
    const out = edit(text, { op: "add", parent: [], route: { path: "b" } });
    expect(out).toContain("  { path: 'a' },\n  { path: 'b' }\n];");
  });

  it("handles a one-line array, double quotes and CRLF", () => {
    const one = `import { Route } from "@gable/core/router";\nconst routes: Route[] = [{ path: "" }, { path: "x" }];\n`;
    expect(edit(one, { op: "add", parent: [], index: 1, route: { path: "y" } })).toContain(`[{ path: "" }, { path: "y" }, { path: "x" }]`);
    const crlf = TODOMVC.replaceAll("\n", "\r\n");
    const out = edit(crlf, { op: "add", parent: [], route: { path: "about" } });
    expect(out).toContain("  { path: 'about' },\r\n  { path: '**'");
    expect(out.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("adds a component with its import, but not a second import", () => {
    const out = edit(TODOMVC, { op: "add", parent: [], route: { path: "about", component: { name: "About", from: "src/pages/about.ts" } } });
    expect(out.split("\n")[1]).toBe("import { About } from './src/pages/about.js';");
    // routes.ts is at the root here, so the import is relative to it
    const again = edit(out, { op: "add", parent: [], route: { path: "x", component: { name: "About", from: "src/pages/about.ts" } } });
    expect(again.match(/import \{ About \}/g)).toHaveLength(1);
  });

  it("edits fields in place: replaces a value, adds a missing field, removes one", () => {
    const withTitle = edit(TODOMVC, { op: "set", at: [1], set: { title: "Active" } });
    expect(withTitle).toContain("{ path: 'active', data: { filter: 'active' }, title: 'Active' }");
    const renamed = edit(withTitle, { op: "set", at: [1], set: { path: "open", title: "Open" } });
    expect(renamed).toContain("{ path: 'open', data: { filter: 'active' }, title: 'Open' }");
    const removed = edit(renamed, { op: "set", at: [1], set: { title: null } });
    expect(removed).toBe(TODOMVC.replace("path: 'active'", "path: 'open'"));
    const redirected = edit(TODOMVC, { op: "set", at: [3], set: { redirectTo: "/active" } });
    expect(redirected).toContain("{ path: '**', redirectTo: '/active' }");
  });

  it("adds to the children of a route, creating `children` when there are none", () => {
    const text = `export const routes: Route[] = [\n  {\n    path: 'users',\n    component: Users,\n    children: [\n      { path: ':id' },\n    ],\n  },\n  { path: 'home' },\n];\n`;
    const nested = edit(text, { op: "add", parent: [0], route: { path: "new" } });
    expect(nested).toContain("      { path: ':id' },\n      { path: 'new' },\n    ],");
    const created = edit(text, { op: "add", parent: [1], route: { path: "x" } });
    expect(created).toContain("{ path: 'home', children: [{ path: 'x' }] }");
    const multi = edit(text, { op: "set", at: [0], set: { title: "Users" } });
    expect(multi).toContain("    children: [\n      { path: ':id' },\n    ],\n    title: 'Users',\n  },");
  });

  it("refuses what it cannot edit", () => {
    expect(() => edit(TODOMVC, { op: "set", at: [9], set: { title: "x" } })).toThrow(/no route at 9/);
    expect(() => edit(TODOMVC, { op: "add", parent: [], route: { path: "a b" } })).toThrow(/not a valid route path/);
    expect(() => edit(`export const x = 1;`, { op: "add", parent: [], route: { path: "a" } })).toThrow(/no route config/);
  });
});

describe("route config files", () => {
  const project = () => {
    const root = mkdtempSync(join(tmpdir(), "designer-routes-"));
    mkdirSync(join(root, "src", "pages"), { recursive: true });
    writeFileSync(join(root, "src", "routes.ts"), TODOMVC);
    writeFileSync(join(root, "src", "main.ts"), `import { provideRouter } from '@gable/core/router';\nimport { routes } from './routes.js';\nprovideRouter(routes);\n`);
    writeFileSync(join(root, "src", "pages", "about.ts"), `import { html } from '@gable/core';\nexport class About {\n  static meta = { selector: 'app-about', template: html\`<p>About</p>\` };\n}\nclass Hidden { static meta = {} }\n`);
    return root;
  };

  it("locates the config and its tree, and lists components", () => {
    const root = project();
    const info = locateRouteConfig(root)!;
    expect(info.file).toBe("src/routes.ts");
    expect(info.routes.map((r) => [r.at, r.path, r.redirectTo])).toEqual([[[0], "", null], [[1], "active", null], [[2], "completed", null], [[3], "**", "/"]]);
    expect(listComponents(root)).toEqual([{ name: "About", file: "src/pages/about.ts" }]);
  });

  it("writes through the host, returns before/after, and refuses an edit that would not parse", () => {
    const root = project();
    const r = editRouteConfig(root, "src/routes.ts", { op: "add", parent: [], route: { path: "about", component: { name: "About", from: "src/pages/about.ts" }, title: "About" } });
    expect(readFileSync(join(root, "src/routes.ts"), "utf8")).toBe(r.after);
    expect(r.before).toBe(TODOMVC);
    expect(r.routes.map((x) => x.path)).toEqual(["", "active", "completed", "about", "**"]);
    expect(r.routes[3]).toMatchObject({ component: "About", title: "About" });
    // a title that closes the string in a way the quoting handles stays valid
    const q = editRouteConfig(root, "src/routes.ts", { op: "set", at: [3], set: { title: "It's \"fine\"" } });
    expect(q.routes[3]!.title).toBe("It's \"fine\"");
  });
});
