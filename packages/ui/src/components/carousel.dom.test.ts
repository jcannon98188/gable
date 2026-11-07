// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "@gable/core";
import { UiCarousel, UiCarouselItem } from "./carousel.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiCarousel, UiCarouselItem],
    template: html`<ui-carousel label="Photos" [(index)]="slide" [indicators]="true" [loop]="loop()" [autoplay]="auto()">
      <ui-carousel-item>One</ui-carousel-item>
      <ui-carousel-item>Two</ui-carousel-item>
      <ui-carousel-item>Three</ui-carousel-item>
    </ui-carousel>`,
  };
  slide = signal(0);
  loop = signal(false);
  auto = signal(0);
}

const SLIDE_WIDTH = 100;
/** jsdom has no layout: slides sit SLIDE_WIDTH apart, shifted by the viewport's scrollLeft. */
function fakeLayout() {
  const viewport = $("[data-carousel-viewport]");
  const slides = $$("[data-carousel-slide]");
  viewport.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
  slides.forEach((slide, i) => (slide.getBoundingClientRect = () => ({ left: i * SLIDE_WIDTH - viewport.scrollLeft }) as DOMRect));
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    viewport.scrollLeft = options.left ?? 0;
  });
  viewport.scrollTo = scrollTo as never;
  return { viewport, scrollTo };
}
const scrollEvent = (viewport: HTMLElement, left: number) => {
  viewport.scrollLeft = left;
  viewport.dispatchEvent(new Event("scroll"));
};
const prevBtn = () => $<HTMLButtonElement>("button[aria-label='Previous slide']");
const nextBtn = () => $<HTMLButtonElement>("button[aria-label='Next slide']");
const dots = () => $$<HTMLButtonElement>("button[aria-label^='Go to slide']");

let motion = false;
beforeEach(() => {
  motion = false;
  window.matchMedia = ((q: string) => ({
    matches: motion,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
});
afterEach(() => vi.useRealTimers());

describe("Carousel semantics", () => {
  it("is a labelled carousel region of numbered slide groups", async () => {
    await boot(App);
    const host = $("ui-carousel");
    expect(host.getAttribute("role")).toBe("region");
    expect(host.getAttribute("aria-roledescription")).toBe("carousel");
    expect(host.getAttribute("aria-label")).toBe("Photos");
    const slides = $$("ui-carousel-item");
    expect(slides.map((s) => s.getAttribute("aria-label"))).toEqual(["1 of 3", "2 of 3", "3 of 3"]);
    for (const s of slides) {
      expect(s.getAttribute("role")).toBe("group");
      expect(s.getAttribute("aria-roledescription")).toBe("slide");
    }
    expect($("[data-carousel-viewport]").getAttribute("tabindex")).toBe("0");
    expect($("[data-carousel-viewport]").getAttribute("aria-live")).toBe("polite");
  });
});

describe("Carousel navigation", () => {
  it("scrolls to the next and previous slides and keeps the model in step", async () => {
    const app = await boot(App);
    const { scrollTo } = fakeLayout();
    expect(prevBtn().disabled).toBe(true);
    nextBtn().click();
    await settle();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: SLIDE_WIDTH, behavior: "smooth" });
    expect(app.slide()).toBe(1);
    expect(prevBtn().disabled).toBe(false);
    nextBtn().click();
    await settle();
    expect(app.slide()).toBe(2);
    expect(nextBtn().disabled).toBe(true);
    prevBtn().click();
    await settle();
    expect(app.slide()).toBe(1);
  });

  it("follows native scrolling (swipe, wheel) by the slide nearest the start edge", async () => {
    const app = await boot(App);
    const { viewport } = fakeLayout();
    scrollEvent(viewport, 190);
    await settle();
    expect(app.slide()).toBe(2);
    expect(dots()[2].getAttribute("aria-current")).toBe("true");
  });

  it("does not jump through intermediate slides while it scrolls to a target", async () => {
    const app = await boot(App);
    const { viewport } = fakeLayout();
    viewport.scrollTo = (() => {}) as never;
    dots()[2].click();
    await settle();
    expect(app.slide()).toBe(2);
    scrollEvent(viewport, 100);
    await settle();
    expect(app.slide()).toBe(2);
    scrollEvent(viewport, 200);
    await settle();
    expect(app.slide()).toBe(2);
  });

  it("goes to a slide from its indicator and from a bound index", async () => {
    const app = await boot(App);
    const { scrollTo } = fakeLayout();
    dots()[1].click();
    await settle();
    expect(app.slide()).toBe(1);
    app.slide.set(2);
    await settle();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 2 * SLIDE_WIDTH, behavior: "smooth" });
    expect(dots().map((b) => b.getAttribute("aria-current"))).toEqual([null, null, "true"]);
  });

  it("handles arrow keys, Home and End from inside the carousel", async () => {
    const app = await boot(App);
    fakeLayout();
    const viewport = $("[data-carousel-viewport]");
    key(viewport, "ArrowRight");
    await settle();
    expect(app.slide()).toBe(1);
    key(viewport, "End");
    await settle();
    expect(app.slide()).toBe(2);
    key(viewport, "ArrowLeft");
    await settle();
    expect(app.slide()).toBe(1);
    key(viewport, "Home");
    await settle();
    expect(app.slide()).toBe(0);
  });

  it("wraps with loop", async () => {
    const app = await boot(App);
    fakeLayout();
    app.loop.set(true);
    await settle();
    expect(prevBtn().disabled).toBe(false);
    prevBtn().click();
    await settle();
    expect(app.slide()).toBe(2);
    nextBtn().click();
    await settle();
    expect(app.slide()).toBe(0);
  });
});

describe("Carousel autoplay", () => {
  const advance = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await settle();
  };
  const setup = async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const app = await boot(App);
    fakeLayout();
    app.auto.set(1000);
    await settle();
    return app;
  };

  it("advances slides, wraps to the first and turns the live region off", async () => {
    const app = await setup();
    expect($("[data-carousel-viewport]").getAttribute("aria-live")).toBe("off");
    await advance(1000);
    expect(app.slide()).toBe(1);
    await advance(2000);
    expect(app.slide()).toBe(0);
  });

  it("pauses while hovered or keyboard-focused and resumes after", async () => {
    const app = await setup();
    const host = $("ui-carousel");
    host.dispatchEvent(new MouseEvent("mouseenter"));
    await settle();
    expect($("[data-carousel-viewport]").getAttribute("aria-live")).toBe("polite");
    await advance(3000);
    expect(app.slide()).toBe(0);
    host.dispatchEvent(new MouseEvent("mouseleave"));
    await settle();
    await advance(1000);
    expect(app.slide()).toBe(1);
    nextBtn().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await settle();
    await advance(3000);
    expect(app.slide()).toBe(1);
    nextBtn().dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    await settle();
    await advance(1000);
    expect(app.slide()).toBe(2);
  });

  it("has a play/pause button that stops and restarts it", async () => {
    const app = await setup();
    $("button[aria-label='Stop automatic slide show']").click();
    await settle();
    await advance(3000);
    expect(app.slide()).toBe(0);
    expect($("button[aria-label='Start automatic slide show']").textContent).toContain("Play");
    $("button[aria-label='Start automatic slide show']").click();
    await settle();
    await advance(1000);
    expect(app.slide()).toBe(1);
  });

  it("never runs under prefers-reduced-motion, and scrolls without animation", async () => {
    motion = true;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const app = await boot(App);
    const { scrollTo } = fakeLayout();
    app.auto.set(1000);
    await settle();
    await advance(5000);
    expect(app.slide()).toBe(0);
    expect($("[data-carousel-viewport]").getAttribute("aria-live")).toBe("polite");
    nextBtn().click();
    await settle();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: SLIDE_WIDTH, behavior: "auto" });
  });
});

describe("Carousel accessibility", () => {
  it("has no axe violations, with and without autoplay", async () => {
    const { expectNoA11yViolations } = await import("@gable/testing/a11y");
    const app = await boot(App);
    await expectNoA11yViolations(document.body);
    app.auto.set(1000);
    await settle();
    await expectNoA11yViolations(document.body);
  });
});
