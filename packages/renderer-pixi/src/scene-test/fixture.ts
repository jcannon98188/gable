// mountWithScene (TASK-105.8): one `mountApp` fixture for a DOM page with a canvas in it. `fixture.root` and the usual
// queries look at the DOM tree (the in-memory test renderer), `fixture.scene` at the scene (the scene test renderer),
// and the two are joined the way production joins them: services and signals shared through DI.
import type { ComponentClass } from "@gable/core";
import { mountApp, type AppFixture, type MountAppOptions } from "@gable/testing";
import type { TestAssets } from "./assets.js";
import type { SceneTestRenderer } from "./renderer.js";

export interface MountWithSceneOptions extends Omit<MountAppOptions, "routes"> {
  /** The scene the page's canvas host builds into: `static meta = { ..., renderer: scene.boundary }`. */
  scene: SceneTestRenderer;
  /** The Assets double; created with `provideTestAssets({ ..., textures: scene.textures })`. */
  assets?: TestAssets;
  /** Routes of the page. Default: one catch-all, so a page without a router outlet settles. */
  routes?: MountAppOptions["routes"];
}

export interface SceneFixture<T extends object> extends AppFixture<T> {
  readonly scene: SceneTestRenderer;
  readonly assets: TestAssets | undefined;
  /** One deterministic loop step of the scene (`scene.frame`); also flushes the DOM side's pending effects. */
  frame(dtMs?: number): void;
  frames(count: number, dtMs?: number): void;
}

/**
 * Mounts `Root` (a page that contains a canvas host component whose `meta.renderer` is `scene.boundary`) into the
 * in-memory DOM renderer, with the router, the Assets double and the scene test renderer wired in.
 *
 * A scene component that throws in its setup, or whose template expression throws, is reported to the fixture's error collector
 * like any DOM-side failure: the test fails when the fixture is destroyed (automatically after each test) unless the failure is
 * claimed with `fixture.errors.expect()`. The component's nodes are absent from the scene meanwhile, which is why an assertion on them fails first.
 */
export function mountWithScene<T extends object>(Root: ComponentClass<T>, options: MountWithSceneOptions): SceneFixture<T> {
  const { scene, assets, routes = [{ path: "**" }], providers = [], ...rest } = options;
  if (assets && assets.textures !== scene.textures) {
    throw new Error("The Assets double and the scene must share one texture registry: provideTestAssets({ ..., textures: scene.textures }).");
  }
  const fixture = mountApp(Root, { ...rest, routes, providers: [...(assets?.providers ?? []), ...providers] });
  return Object.create(fixture, {
    scene: { value: scene },
    assets: { value: assets },
    frame: { value: (dtMs?: number) => scene.frame(dtMs) },
    frames: { value: (count: number, dtMs?: number) => scene.frames(count, dtMs) },
  }) as SceneFixture<T>;
}
