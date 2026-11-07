// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiTree, type TreeNode } from "./tree.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

/** A route tree: nested routes, a badge per row and an icon action area. */
const ROUTES: TreeNode[] = [
  {
    id: "/",
    label: "/",
    badge: { text: "layout" },
    children: [
      { id: "/about", label: "about", badge: { text: "page", variant: "outline" }, actions: [{ id: "open", label: "Open /about", icon: "x" }] },
      {
        id: "/users",
        label: "users",
        badge: { text: "3", variant: "info" },
        actions: [{ id: "add", label: "Add child route", text: "+" }],
        children: [{ id: "/users/:id", label: ":id", description: "dynamic" }],
      },
    ],
  },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiTree],
    template: html`<ui-tree label="Routes" [nodes]="routes" [(expanded)]="open" [(selected)]="picked" selectionMode="single" [actionsAlways]="always()" (action)="onAction($event)" (activated)="onActivated($event)"></ui-tree>`,
  };
  routes = ROUTES;
  open = signal<string[]>(["/", "/users"]);
  picked = signal<string[]>(["/about"]);
  always = signal(false);
  log: string[] = [];
  onAction(e: { action: string; node: TreeNode }) {
    this.log.push(`${e.action}:${e.node.id}`);
  }
  onActivated(n: TreeNode) {
    this.log.push(`activated:${n.id}`);
  }
}

const boot = useDomApp();
const rows = () => $$("[role=treeitem]");
const rowOf = (id: string) => rows().find((r) => r.textContent!.includes(id))!;

describe("tree as a route tree", () => {
  it("shows nested rows, the selected row and per-row badges", async () => {
    await boot(App);
    expect(rows().map((r) => r.getAttribute("aria-level"))).toEqual(["1", "2", "2", "3"]);
    expect(rowOf("about").getAttribute("aria-selected")).toBe("true");
    const badges = rows().map((r) => r.querySelector("[class*=rounded-md][class*=border]")?.textContent?.trim());
    expect(badges).toEqual(["layout", "page", "3", undefined]);
    expect(rows()[2]!.querySelector("[class*=text-info]")).not.toBeNull();
  });

  it("renders an icon action named by its label, and the actions stay visible when asked", async () => {
    const app = await boot(App);
    const icon = rowOf("about").querySelector("button")!;
    expect(icon.getAttribute("aria-label")).toBe("Open /about");
    expect(icon.getAttribute("title")).toBe("Open /about");
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(icon.parentElement!.className).toContain("opacity-0");
    app.always.set(true);
    await settle();
    expect(rowOf("about").querySelector("button")!.parentElement!.className).not.toContain("opacity-0");
  });

  it("keeps keyboard navigation with actions and badges in the row", async () => {
    const app = await boot(App);
    rowOf("about").focus();
    key(document.activeElement!, "ArrowDown");
    await settle();
    expect(document.activeElement).toBe(rowOf("users"));
    key(document.activeElement!, "ArrowDown");
    await settle();
    expect(document.activeElement!.getAttribute("aria-level")).toBe("3");
    key(document.activeElement!, "ArrowLeft");
    await settle();
    expect(document.activeElement).toBe(rowOf("users"));
    // only the focused row's action is in the tab order; a key on the button does not move the row focus
    expect(rowOf("users").querySelector("button")!.getAttribute("tabindex")).toBe("0");
    expect(rowOf("about").querySelector("button")!.getAttribute("tabindex")).toBe("-1");
    const add = rowOf("users").querySelector("button")!;
    key(add, "ArrowDown");
    await settle();
    expect(document.activeElement).toBe(rowOf("users"));
    add.click();
    await settle();
    expect(app.log).toEqual(["add:/users"]);
    key(rowOf("users"), "Enter");
    await settle();
    expect(app.log).toEqual(["add:/users", "activated:/users"]);
  });

  it("has no axe violations", async () => {
    await boot(App);
    await expectNoA11yViolations(document.body);
    expect($("ui-tree").getAttribute("role")).toBe("tree");
  });
});
