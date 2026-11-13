import { describe, expect, it } from "vitest";
import { computed, html, inject, signal } from "@gable/core";
import { Assets, Frame, ReducedMotion } from "../index.js";
import { createSceneTestRenderer, mountWithScene, provideTestAssets } from "../testing.js";

class GameState {
  static scope = "root";
  hits = signal(0);
}

function setup(extra: { assets?: boolean } = {}) {
  const scene = createSceneTestRenderer();
  class Ship {
    static meta = { selector: "game-ship", template: html`<sprite label="ship" [x]="x()" /> @if (level.ready()) { <sprite label="level-art" texture="bg" /> }` };
    state = inject(GameState);
    x = computed(() => this.state.hits() * 10);
    level = inject(Assets).bundle("level1");
    _load = this.level.load();
  }
  class NoAssetsShip {
    static meta = { selector: "game-ship", template: html`<sprite label="ship" [x]="x()" />` };
    state = inject(GameState);
    x = computed(() => this.state.hits() * 10);
  }
  // A scene component projected from a page cannot inject boundary services (ADR 0019): the host has its own template.
  class Canvas {
    static meta = { selector: "game-canvas", imports: [extra.assets ? Ship : NoAssetsShip], template: html`<game-ship></game-ship>`, renderer: scene.boundary };
  }
  class App {
    static meta = {
      selector: "app-root",
      imports: [Canvas],
      template: html`<button (click)="inc()">hit</button><p>{{ state.hits() }} hits</p><game-canvas></game-canvas>`,
    };
    state = inject(GameState);
    inc() {
      this.state.hits.update((n) => n + 1);
    }
  }
  const assets = extra.assets ? provideTestAssets({ bundles: { level1: [{ alias: "bg", src: "bg.png" }] }, textures: scene.textures }) : undefined;
  const fixture = mountWithScene(App, { scene, assets });
  return { scene, assets, fixture };
}

describe("mountWithScene: DOM and scene in one fixture", () => {
  it("clicks a HUD button in the DOM tree and asserts on a scene node, joined by a DI-shared signal", () => {
    const { fixture } = setup();
    expect(fixture.scene.find("sprite#ship")!.x).toBe(0);
    fixture.dispatch(fixture.query("button")!, "click");
    fixture.frame();
    expect(fixture.text()).toContain("1 hits");
    expect(fixture.scene.find("sprite#ship")!.x).toBe(10);
    // The scene's nodes are in the scene renderer, not in the DOM-side fixture tree.
    expect(fixture.query("sprite")).toBeNull();
    expect(fixture.query("game-canvas")).not.toBeNull();
  });

  it("has fixture.frame and fixture.frames drive the scene's Frame service", () => {
    const { scene, fixture } = setup();
    const dts: number[] = [];
    scene.services.frame.onFrame((dt) => dts.push(dt));
    fixture.frame();
    fixture.frames(2, 20);
    expect(dts).toEqual([0.016, 0.02, 0.02]);
    expect(scene.renders).toBe(3);
    expect(scene.services.frame).toBeInstanceOf(Frame);
  });

  it("destroys the scene renderer when the fixture is destroyed", () => {
    const { scene, fixture } = setup();
    expect(scene.destroyed).toBe(false);
    fixture.destroy();
    expect(scene.destroyed).toBe(true);
  });

  it("takes the Assets double: a scripted bundle gates scene content and is released with the fixture", async () => {
    const { scene, assets, fixture } = setup({ assets: true });
    expect(scene.find("sprite#level-art")).toBeNull();
    await fixture.settle();
    fixture.frame();
    expect(scene.find("sprite#level-art")!.texture).toMatchObject({ alias: "bg" });
    fixture.destroy();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    assets!.bundle("level1").expectReleased();
  });

  it("insists that the Assets double fills the scene's texture registry", () => {
    const scene = createSceneTestRenderer();
    class Page {
      static meta = { selector: "app-page", template: html`` };
    }
    expect(() => mountWithScene(Page, { scene, assets: provideTestAssets({ bundles: ["x"] }) })).toThrow(/textures: scene\.textures/);
  });
});

describe("mountWithScene: the accessibility mirror (TASK-105.9)", () => {
  function a11yApp() {
    const scene = createSceneTestRenderer();
    class Menu {
      static meta = {
        selector: "game-menu",
        template: html`<container label="menu"><sprite label="play" width="40" height="20" x="10" y="5" [a11y]="playA11y" (pointertap)="play($event)" /><sprite label="quit" width="40" height="20" y="40" [a11y]="quitA11y" /><sprite label="logo" [a11y]="logoA11y" /></container>`,
      };
      state = inject(GameState);
      playA11y = { role: "button", label: "Play" };
      quitA11y = { role: "button", label: "Quit" };
      logoA11y = { role: "img", label: "Logo" };
      play(event: { pointerType: string }) {
        if (event.pointerType === "a11y") this.state.hits.update((n) => n + 1);
      }
    }
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Menu], template: html`<game-menu></game-menu>`, renderer: scene.boundary };
    }
    class App {
      static meta = { selector: "app-root", imports: [Canvas], template: html`<p>{{ state.hits() }} activations</p><game-canvas></game-canvas>` };
      state = inject(GameState);
    }
    return mountWithScene(App, { scene });
  }

  it("exposes the mirror, focus, tab, press and click on fixture.scene", () => {
    const fixture = a11yApp();
    fixture.frame();
    const entries = fixture.scene.a11y();
    expect(entries.map((e) => [e.role, e.label, e.focusable])).toEqual([["button", "Play", true], ["button", "Quit", true], ["img", "Logo", false]]);
    expect(entries[0]!.bounds).toEqual({ x: 10, y: 5, width: 40, height: 20 });

    const play = fixture.scene.find("sprite#play")!;
    expect(fixture.scene.focus(play)).toBe(true);
    expect(fixture.scene.focused).toBe(play.node);
    expect(fixture.scene.press("Enter")).toBe(true);
    fixture.frame();
    expect(fixture.text()).toContain("1 activations");

    expect(fixture.scene.tab()).toBe(fixture.scene.find("sprite#quit")!.node);
    expect(fixture.scene.tab()).toBeNull();
    expect(fixture.scene.tab({ shift: true })).toBe(fixture.scene.find("sprite#quit")!.node);
    expect(fixture.scene.focus("sprite#logo")).toBe(false);

    expect(fixture.scene.click("sprite#play")).toBe(true);
    fixture.frame();
    expect(fixture.text()).toContain("2 activations");
  });

  it("leaves out hidden nodes", () => {
    const fixture = a11yApp();
    fixture.frame();
    fixture.scene.find("sprite#quit")!.node.values.visible = false;
    fixture.frame();
    expect(fixture.scene.a11y().map((e) => e.label)).toEqual(["Play", "Logo"]);
  });

  // TASK-105.22: a scene component that fails must fail the test, not quietly vanish from the scene.
  function failing(Scene: new () => object) {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Scene], template: html`<scene-bad></scene-bad>`, renderer: scene.boundary };
    }
    class App {
      static meta = { selector: "app-root", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    return { scene, App };
  }

  it("fails loudly when a scene component throws in its setup", () => {
    class Bad {
      static meta = { selector: "scene-bad", template: html`<sprite label="bad" />` };
      oops = (() => {
        throw new Error("setup exploded");
      })();
    }
    const { scene, App } = failing(Bad);
    const run = () => {
      const fixture = mountWithScene(App, { scene });
      fixture.frame();
      fixture.destroy();
    };
    expect(run).toThrow(/setup exploded/);
  });

  it("fails loudly when a scene template expression throws", () => {
    class Bad {
      static meta = { selector: "scene-bad", template: html`<sprite label="bad" [x]="broken()" />` };
      broken(): number {
        throw new Error("binding exploded");
      }
    }
    const { scene, App } = failing(Bad);
    const run = () => {
      const fixture = mountWithScene(App, { scene });
      fixture.frame();
      fixture.destroy();
    };
    expect(run).toThrow(/binding exploded/);
  });

  it("provides ReducedMotion like the real host, so a scene component can inject it", () => {
    const scene = createSceneTestRenderer();
    let reduced: boolean | undefined;
    let injected: ReducedMotion | undefined;
    class Calm {
      static meta = { selector: "scene-calm", template: html`<sprite label="calm" />` };
      motion = (injected = inject(ReducedMotion));
      read = (reduced = this.motion.reduced());
    }
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Calm], template: html`<scene-calm></scene-calm>`, renderer: scene.boundary };
    }
    class App {
      static meta = { selector: "app-root", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(App, { scene });
    expect(reduced).toBe(false);
    scene.services.reducedMotion.reduced.set(true);
    expect(injected).toBe(scene.services.reducedMotion);
    expect(injected!.reduced()).toBe(true);
    expect(fixture.scene.find("sprite#calm")).not.toBeNull();
  });
});
