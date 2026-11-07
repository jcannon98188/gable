// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiJsonViewer } from "./json-viewer.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

const LONG = "a_remarkably_long_property_name_that_cannot_fit_in_a_narrow_panel";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiJsonViewer],
    template: html`<ui-json-viewer label="Data" [value]="data" [compact]="compact()" [compactBelow]="320" [wrapKeys]="wrap()"></ui-json-viewer>`,
  };
  data = { [LONG]: "value", child: { x: 1 } };
  compact = signal(false);
  wrap = signal(false);
}

const boot = useDomApp();
const setWidth = (px: number) => Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => px });
afterEach(() => setWidth(0));
const rows = () => $$("[role=treeitem]");
const keyRow = () => rows().find((r) => r.textContent!.includes(LONG))!;

describe("json viewer in a narrow column", () => {
  it("truncates a long key and keeps the full key in a tooltip and in the text", async () => {
    setWidth(600);
    await boot(App);
    const label = keyRow().querySelector<HTMLElement>(".truncate")!;
    expect(label.getAttribute("title")).toBe(LONG);
    expect(label.textContent!.trim()).toBe(LONG);
  });

  it("wraps keys instead when wrapKeys is on", async () => {
    setWidth(600);
    const app = await boot(App);
    app.wrap.set(true);
    await settle();
    const label = keyRow().querySelector<HTMLElement>("[title]")!;
    expect(label.className).toContain("whitespace-normal");
    expect(label.className).not.toContain("truncate");
    expect(keyRow().className).toContain("h-auto");
  });

  it("is compact below the threshold: tighter indent, value on a second line", async () => {
    setWidth(280);
    await boot(App);
    const row = keyRow();
    expect(row.className).toContain("h-auto");
    expect(row.querySelector("span.flex-col")).not.toBeNull();
    const nested = rows().find((r) => r.getAttribute("aria-level") === "2")!;
    expect((nested.firstElementChild as HTMLElement).style.width).toBe("8px");
    expect($("ui-json-viewer").className).toContain("text-xs");
  });

  it("stays roomy above the threshold and compacts when asked", async () => {
    setWidth(600);
    const app = await boot(App);
    expect(keyRow().className).not.toContain("h-auto");
    expect((keyRow().firstElementChild as HTMLElement).style.width).toBe("16px");
    app.compact.set(true);
    await settle();
    expect((keyRow().firstElementChild as HTMLElement).style.width).toBe("8px");
  });

  it("has no axe violations at a narrow width", async () => {
    setWidth(280);
    await boot(App);
    await expectNoA11yViolations(document.body);
  });
});
