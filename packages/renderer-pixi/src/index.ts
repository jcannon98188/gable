// Entry point for the Pixi renderer, the <gable-canvas> host and the services.
// The shared tag and property table is re-exported from here and lives in ./elements.
export * from "./elements.js";
export { isParticleHost, particles } from "./particles.js";
export type { ParticleHost, ParticleLike, ParticleOptions, ParticleSet } from "./particles.js";
export { CanvasSize } from "./canvas-size.js";
export { Frame, MAX_FRAME_DT } from "./frame.js";
export type { FixedStepHook, FrameHook } from "./frame.js";
export { Gamepad } from "./gamepad.js";
export type { GamepadButtonSnapshot, GamepadSnapshot, GamepadSource, GetGamepads } from "./gamepad.js";
export { Keyboard } from "./keyboard.js";
export { Pointer } from "./pointer.js";
export type { PointerPoint, PointerStage } from "./pointer.js";
export { GableCanvas } from "./host.js";
export { createPixiRenderer, pixiRenderer } from "./renderer.js";
export type { ApplicationLike, FrameScheduler, PixiRendererOptions, PixiSceneRenderer, TagRegistration } from "./renderer.js";
export { Assets, provideAssets } from "./assets.js";
export type { AssetsBackend, AssetsOptions, BundleEntries, BundleHandle, BundleStatus, LoadOptions } from "./assets.js";
export { A11yMirror, isInteractiveRole } from "./a11y.js";
export type { A11yActivationEvent, A11yBounds, A11yEntry, A11yNode, A11yProps, A11ySink } from "./a11y.js";
export { announceOnChange } from "./announce.js";
export type { AnnounceOptions } from "./announce.js";
export { ReducedMotion } from "./reduced-motion.js";
export type { MatchMedia, MediaQueryListLike } from "./reduced-motion.js";
