// Entry point for the scene test renderer, test doubles and parity suite (canvas/127): `@gablejs/renderer-pixi/testing`.
export { createSceneTestRenderer } from "./scene-test/renderer.js";
export type { SceneTestOptions, SceneTestRenderer, StubTextures } from "./scene-test/renderer.js";
export { SceneNode } from "./scene-test/node.js";
export type { Point, SceneNodeData, ShapeData, StubParticle, StubTexture } from "./scene-test/node.js";
export type { GamepadSimulator, KeyboardSimulator, PointerSimulator } from "./scene-test/input.js";
export { provideTestAssets } from "./scene-test/assets.js";
export type { BundleScript, TestAssets, TestAssetsOptions } from "./scene-test/assets.js";
export { mountWithScene } from "./scene-test/fixture.js";
export type { MountWithSceneOptions, SceneFixture } from "./scene-test/fixture.js";
export { A11yRecorder } from "./a11y-testing.js";
export type { TabOptions } from "./a11y-testing.js";
export { A11yMirror } from "./a11y.js";
export type { A11yEntry, A11yNode, A11yProps } from "./a11y.js";
