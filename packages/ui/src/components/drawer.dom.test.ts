// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiButton } from "./button.js";
import { DialogTrigger } from "./dialog.js";
import { UiDrawer } from "./drawer.js";
import { $, key, settle, useDomApp } from "../test-utils.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiDrawer, DialogTrigger, UiButton],
    template: html`<ui-drawer [(open)]="open" [side]="side()" [snapPoints]="snaps()" [(snap)]="snap" heading="Move goal" description="Set your daily goal.">
      <button data-t="trigger" slot="trigger" dialogTrigger uiButton variant="outline">Open</button>
      <p class="body">Body text</p>
      <div slot="footer"><button id="submit" uiButton (click)="open.set(false)">Submit</button></div>
    </ui-drawer>`,
  };
  open = signal(false);
  side = signal<"top" | "right" | "bottom" | "left">("bottom");
  snaps = signal<number[]>([1]);
  snap = signal<number | null>(null);
}

const boot = useDomApp();
let clock = 0;
const drag = (target: Element, type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "timeStamp", { value: clock });
  target.dispatchEvent(event);
};
const panel = () => $("[role=dialog]");
const sized = () => {
  panel().getBoundingClientRect = () => ({ width: 300, height: 400, top: 0, left: 0, right: 300, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
};

describe("Drawer in jsdom", () => {
  it("opens from the trigger as a bottom sheet with a grab handle, and closes on Escape", async () => {
    const app = await boot(App);
    expect(panel().hidden).toBe(true);
    $("[data-t=trigger]").click();
    await settle();
    expect(app.open()).toBe(true);
    expect(panel().getAttribute("data-state")).toBe("open");
    expect(panel().className).toContain("bottom-0");
    expect(panel().querySelector("[data-slot=drawer-handle]")).not.toBeNull();
    expect(panel().contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden"); // scroll lock
    key(document.activeElement!, "Escape");
    await settle();
    expect(app.open()).toBe(false);
  });

  it("drags closed from the header with the pointer", async () => {
    const app = await boot(App);
    $("[data-t=trigger]").click();
    await settle();
    sized();
    const header = panel().querySelector("h2")!;
    clock = 0;
    drag(header, "pointerdown", 50, 100);
    clock = 400;
    drag(header, "pointermove", 50, 330);
    expect(panel().style.transform).toBe("translate3d(0,230px,0)");
    clock = 800;
    drag(header, "pointerup", 50, 330);
    await settle();
    expect(app.open()).toBe(false);
    expect(panel().getAttribute("data-state")).toBe("closed");
    expect(panel().hasAttribute("data-dragged")).toBe(true);
  });

  it("stays open and settles back when released before half way", async () => {
    const app = await boot(App);
    $("[data-t=trigger]").click();
    await settle();
    sized();
    clock = 0;
    drag(panel(), "pointerdown", 50, 100);
    clock = 400;
    drag(panel(), "pointermove", 50, 160);
    clock = 800;
    drag(panel(), "pointerup", 50, 160);
    await settle();
    expect(app.open()).toBe(true);
    expect(panel().getAttribute("data-state")).toBe("open");
  });

  it("is not draggable from the footer button", async () => {
    const app = await boot(App);
    $("[data-t=trigger]").click();
    await settle();
    sized();
    clock = 0;
    drag($("#submit"), "pointerdown", 50, 100);
    clock = 400;
    drag($("#submit"), "pointermove", 50, 330);
    expect(panel().style.transform).toBe("");
    expect(app.open()).toBe(true);
  });

  it("rests at a snap point and reports it through [(snap)]", async () => {
    const app = await boot(App);
    app.snaps.set([0.5, 1]);
    $("[data-t=trigger]").click();
    await settle();
    sized();
    clock = 0;
    drag(panel(), "pointerdown", 50, 0);
    clock = 400;
    drag(panel(), "pointermove", 50, 200);
    clock = 800;
    drag(panel(), "pointerup", 50, 200);
    await settle();
    expect(app.snap()).toBe(0.5);
    expect(app.open()).toBe(true);
    expect(panel().style.transform).toBe("translate3d(0,50%,0)");
  });

  it("drags toward its own edge for side=right and has no grab handle", async () => {
    const app = await boot(App);
    app.side.set("right");
    $("[data-t=trigger]").click();
    await settle();
    sized();
    expect(panel().querySelector("[data-slot=drawer-handle]")).toBeNull();
    clock = 0;
    drag(panel(), "pointerdown", 100, 10);
    clock = 400;
    drag(panel(), "pointermove", 100 + 250, 10);
    clock = 800;
    drag(panel(), "pointerup", 350, 10);
    await settle();
    expect(app.open()).toBe(false);
  });

  it("fades the backdrop with the drag", async () => {
    await boot(App);
    $("[data-t=trigger]").click();
    await settle();
    sized();
    const backdrop = () => $("[data-scope=dialog][data-part=backdrop]");
    clock = 0;
    drag(panel(), "pointerdown", 50, 100);
    clock = 400;
    drag(panel(), "pointermove", 50, 200);
    await settle();
    expect(Number(backdrop().style.opacity)).toBeCloseTo(0.75, 2);
    expect(backdrop().style.transition).toBe("none");
  });

  it("closes from a snap point below full by sliding out from where it rests", async () => {
    const app = await boot(App);
    app.snaps.set([0.5, 1]);
    $("[data-t=trigger]").click();
    await settle();
    sized();
    clock = 0;
    drag(panel(), "pointerdown", 50, 0);
    clock = 400;
    drag(panel(), "pointermove", 50, 200);
    clock = 800;
    drag(panel(), "pointerup", 50, 200);
    await settle();
    expect(app.snap()).toBe(0.5);
    key(document.activeElement!, "Escape");
    await settle();
    expect(app.open()).toBe(false);
    expect(panel().hasAttribute("data-dragged")).toBe(true); // the CSS exit (which restarts at the natural position) is off
    expect(panel().style.transform).toBe("translate3d(0,100%,0)");
    expect(panel().style.transition).toContain("transform");
  });

  it("closing from full height leaves the CSS exit animation alone", async () => {
    const app = await boot(App);
    $("[data-t=trigger]").click();
    await settle();
    key(document.activeElement!, "Escape");
    await settle();
    expect(app.open()).toBe(false);
    expect(panel().hasAttribute("data-dragged")).toBe(false);
    expect(panel().style.transform).toBe("");
  });

  it("animates a snap change made while open", async () => {
    const app = await boot(App);
    app.snaps.set([0.4, 1]);
    $("[data-t=trigger]").click();
    await settle();
    expect(panel().style.transform).toBe("");
    app.snap.set(0.4);
    await settle();
    expect(panel().style.transform).toBe("translate3d(0,60%,0)");
    expect(panel().style.transition).toContain("transform 300ms");
    app.snap.set(1);
    await settle();
    expect(panel().style.transform).toBe("translate3d(0,0%,0)");
  });

  it("has no axe violations open", async () => {
    await boot(App);
    $("[data-t=trigger]").click();
    await settle();
    await expectNoA11yViolations(document.body);
  });
});
