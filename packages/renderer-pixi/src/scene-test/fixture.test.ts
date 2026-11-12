import { describe, expect, it } from "vitest";
import { computed, html, inject, signal } from "@gable/core";
import { Assets, Frame } from "../index.js";
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
