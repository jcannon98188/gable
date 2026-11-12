// Entry point for the Pixi renderer, the <gable-canvas> host and the services.
// The shared tag and property table is re-exported from here and lives in ./elements.
export * from "./elements.js";
export { CanvasSize } from "./canvas-size.js";
export { GableCanvas } from "./host.js";
export { createPixiRenderer, pixiRenderer } from "./renderer.js";
export type { ApplicationLike, PixiRendererOptions, PixiSceneRenderer, TagRegistration } from "./renderer.js";
export { Assets, provideAssets } from "./assets.js";
export type { AssetsBackend, AssetsOptions, BundleEntries, BundleHandle, BundleStatus, LoadOptions } from "./assets.js";
