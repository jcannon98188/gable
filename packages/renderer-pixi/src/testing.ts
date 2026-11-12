// Entry point for the scene test renderer, test doubles and parity suite (TASK-105.8): `@gable/renderer-pixi/testing`.
export { createSceneTestRenderer } from "./scene-test/renderer.js";
export type { SceneTestOptions, SceneTestRenderer, StubTextures } from "./scene-test/renderer.js";
export { SceneNode } from "./scene-test/node.js";
export type { Point, SceneNodeData, ShapeData, StubTexture } from "./scene-test/node.js";
export type { GamepadSimulator, KeyboardSimulator, PointerSimulator } from "./scene-test/input.js";
