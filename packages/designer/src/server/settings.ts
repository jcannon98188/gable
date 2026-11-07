// Per-project Designer settings (saved device presets, the frame layout). They live in the user's data directory, keyed by
// the project path: the Designer writes nothing into the project for its own state, and the desktop window's origin (and so
// its localStorage) changes with every launch, so the browser cannot keep them.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EMPTY_SETTINGS, sanitizeSettings, type ProjectSettings } from "../devices.js";

/** The directory settings are kept in: `GABLE_DESIGNER_DATA`, else the platform's per-user data directory. */
export function dataDir(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): string {
  if (env.GABLE_DESIGNER_DATA) return env.GABLE_DESIGNER_DATA;
  if (platform === "win32") return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "gable-designer");
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "gable-designer");
  return join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "gable-designer");
}

const fileFor = (dir: string, root: string) => join(dir, "projects", `${createHash("sha1").update(root).digest("hex").slice(0, 16)}.json`);

export function readSettings(root: string, dir: string = dataDir()): ProjectSettings {
  try {
    return sanitizeSettings(JSON.parse(readFileSync(fileFor(dir, root), "utf8")));
  } catch {
    return { ...EMPTY_SETTINGS, presets: [] };
  }
}

export function writeSettings(root: string, value: unknown, dir: string = dataDir()): ProjectSettings {
  const settings = sanitizeSettings(value);
  const file = fileFor(dir, root);
  mkdirSync(join(dir, "projects"), { recursive: true });
  writeFileSync(file + ".tmp", JSON.stringify({ root, ...settings }, null, 2));
  renameSync(file + ".tmp", file);
  return settings;
}
