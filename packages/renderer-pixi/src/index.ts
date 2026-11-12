// Entry point for the Pixi renderer, the <gable-canvas> host and the services.
// The shared tag and property table is re-exported from here and lives in ./elements.
export * from "./elements.js";
export { CanvasSize } from "./canvas-size.js";
export { Frame, MAX_FRAME_DT } from "./frame.js";
export type { FixedStepHook, FrameHook } from "./frame.js";
export { GableCanvas } from "./host.js";
export { createPixiRenderer, pixiRenderer } from "./renderer.js";
export type { ApplicationLike, FrameScheduler, PixiRendererOptions, PixiSceneRenderer, TagRegistration } from "./renderer.js";
export { Assets, provideAssets } from "./assets.js";
export type { AssetsBackend, AssetsOptions, BundleEntries, BundleHandle, BundleStatus, LoadOptions } from "./assets.js";
