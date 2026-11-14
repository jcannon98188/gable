// @gable/service-worker/runtime: the default declarative worker driven by gable.sw.json (ADR 0021).
// It is built on @gable/service-worker/core's public exports only; runtime-boundary.test.ts enforces that.
export {
  ServiceWorkerConfigError,
  validateConfig,
  type AssetGroupConfig,
  type AssetInstallMode,
  type DataGroupConfig,
  type DataStrategy,
  type NavigationFallbackConfig,
  type ServiceWorkerConfig,
  type ServiceWorkerConfigIssue,
} from "./config.js";
export { validateManifest, type AssetManifest } from "./manifest.js";
export { defineWorker, type WorkerDefinition, type WorkerDefinitionOptions, type WorkerExtendContext, type WorkerExtension } from "./worker.js";
