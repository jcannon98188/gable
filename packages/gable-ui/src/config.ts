import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import type { GableUiConfig } from "./types.js";

/** The name of the project config file, `gable-ui.json`, created in the project root by `gable-ui init`. */
export const CONFIG_FILE = "gable-ui.json";

/** The config `init` writes and the value used for any field missing from `gable-ui.json`: components in `src/components/ui`, helpers in `src/lib/ui`, the theme in `src/global.css`, base colour `neutral`. */
export const DEFAULT_CONFIG: GableUiConfig = {
  componentsDir: "src/components/ui",
  utilsDir: "src/lib/ui",
  css: "src/global.css",
  baseColor: "neutral",
};

/** Normalises a project-relative path to forward slashes without a leading `./` or trailing slash; throws if it leaves the project. */
export function projectPath(value: string, field: string): string {
  const normalised = posix.normalize(value.replace(/\\/g, "/")).replace(/\/+$/, "");
  if (!normalised || normalised === "." || normalised.startsWith("../") || normalised === ".." || normalised.startsWith("/") || /^[a-zA-Z]:/.test(normalised)) {
    throw new Error(`${CONFIG_FILE}: "${field}" must be a path inside the project (got "${value}").`);
  }
  return normalised;
}

/** Checks a parsed `gable-ui.json` and fills the defaults for missing fields. */
export function parseConfig(value: unknown): GableUiConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${CONFIG_FILE} must be a JSON object.`);
  const raw = value as Record<string, unknown>;
  const str = (field: keyof GableUiConfig): string | undefined => {
    const v = raw[field];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || !v) throw new Error(`${CONFIG_FILE}: "${field}" must be a non-empty string.`);
    return v;
  };
  const config: GableUiConfig = {
    componentsDir: projectPath(str("componentsDir") ?? DEFAULT_CONFIG.componentsDir, "componentsDir"),
    utilsDir: projectPath(str("utilsDir") ?? DEFAULT_CONFIG.utilsDir, "utilsDir"),
    css: projectPath(str("css") ?? DEFAULT_CONFIG.css, "css"),
    baseColor: str("baseColor") ?? DEFAULT_CONFIG.baseColor,
  };
  const registry = str("registry");
  if (registry) config.registry = registry;
  if (config.componentsDir === config.utilsDir) throw new Error(`${CONFIG_FILE}: "componentsDir" and "utilsDir" must differ.`);
  return config;
}

/** The project's config, or undefined when `init` has not run. */
export function readConfig(cwd: string): GableUiConfig | undefined {
  const file = join(cwd, CONFIG_FILE);
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`);
  }
  return parseConfig(parsed);
}

/** Writes `config` to `gable-ui.json` in `cwd` (pretty-printed JSON with a trailing newline), replacing any existing file. It does not validate: run values through `parseConfig` first. */
export function writeConfig(cwd: string, config: GableUiConfig): void {
  writeFileSync(join(cwd, CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
}
