// Frames and devices: the data the canvas, the backend and the preview agent agree on, plus the pure geometry (rotation,
// fit-to-screen scale, breakpoints). No DOM and no Node here, so the shell, the server and the tests all import it.

export type ColorScheme = "auto" | "light" | "dark";

/** What a frame emulates beyond its size. `auto` / `false` / `null` mean "do not override" (the browser's own value). */
export interface Emulation {
  /** Touch input: `pointer: coarse`, `hover: none`, touch points and (agent-side) touch events from the mouse. */
  touch: boolean;
  colorScheme: ColorScheme;
  reducedMotion: boolean;
  userAgent: string | null;
  /**
   * Text size as a factor of the page's own (the agent multiplies the root font size, so rem-based type follows; px does
   * not). Absent means 1.
   */
  textScale?: number;
}

/** The text sizes the environment row offers (as the OS text-size settings go). */
export const TEXT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 2] as const;

/** A text scale from anywhere (settings, the URL, a select), as a factor between 0.5 and 3; 1 when it is not a number. */
export function clampTextScale(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(Math.min(3, Math.max(0.5, n)) * 100) / 100;
}

export const NO_EMULATION: Emulation = { touch: false, colorScheme: "auto", reducedMotion: false, userAgent: null };

/** A saved device: size, pixel ratio and emulation, in portrait (width <= height for phones and tablets). */
export interface DevicePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  dpr: number;
  emulation: Emulation;
  /** Built in, not saved per project. */
  builtin?: boolean;
}

/** One frame on the canvas. `width`/`height` are the device's portrait size; `landscape` swaps them. */
export interface FrameConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  dpr: number;
  landscape: boolean;
  emulation: Emulation;
  /** The preset it was made from, for the label; editing the size makes it custom (`null`). */
  presetId: string | null;
}

/** What the Designer keeps per project (in the user's data directory, never in the project). */
export interface ProjectSettings {
  presets: DevicePreset[];
  frames: FrameConfig[] | null;
  sync: boolean;
  /** The shell's own chrome: theme, open tabs and panel sizes. Left out until the shell has saved it. */
  chrome?: ChromeSettings;
}

/** What the window remembers per project. Not in localStorage: the desktop window's origin changes with every launch. */
export interface ChromeSettings {
  theme: "system" | "light" | "dark";
  /** Left, centre and right widths in percent, or null for the defaults. */
  panels: number[] | null;
  /** Canvas and drawer heights in percent while the drawer is open, or null for the defaults. */
  column: number[] | null;
  drawerOpen: boolean;
  drawerTab: string;
  rightTab: string;
}

export const EMPTY_SETTINGS: ProjectSettings = { presets: [], frames: null, sync: false };

const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const touch: Emulation = { ...NO_EMULATION, touch: true };

export const BUILTIN_PRESETS: readonly DevicePreset[] = [
  { id: "iphone-se", name: "iPhone SE", width: 375, height: 667, dpr: 2, emulation: { ...touch, userAgent: UA_IPHONE }, builtin: true },
  { id: "iphone-15", name: "iPhone 15", width: 393, height: 852, dpr: 3, emulation: { ...touch, userAgent: UA_IPHONE }, builtin: true },
  { id: "pixel-7", name: "Pixel 7", width: 412, height: 915, dpr: 2.625, emulation: { ...touch, userAgent: UA_ANDROID }, builtin: true },
  { id: "ipad-mini", name: "iPad Mini", width: 768, height: 1024, dpr: 2, emulation: { ...touch, userAgent: UA_IPAD }, builtin: true },
  { id: "ipad-pro-11", name: "iPad Pro 11\"", width: 834, height: 1194, dpr: 2, emulation: { ...touch, userAgent: UA_IPAD }, builtin: true },
  { id: "laptop", name: "Laptop", width: 1280, height: 800, dpr: 1, emulation: NO_EMULATION, builtin: true },
  { id: "desktop", name: "Desktop", width: 1920, height: 1080, dpr: 1, emulation: NO_EMULATION, builtin: true },
];

export const MIN_SIZE = 200;
export const MAX_SIZE = 4000;
export const MAX_FRAMES = 6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const whole = (n: number, fallback: number) => (Number.isFinite(n) ? Math.round(n) : fallback);
/** A width or height within the allowed range (whole pixels). */
export const clampSize = (n: number, fallback = 800): number => clamp(whole(n, fallback), MIN_SIZE, MAX_SIZE);

/** A frame from a preset (or a custom one when `preset` is null). */
export function frameFrom(id: string, preset: DevicePreset | null, fallback: { width: number; height: number } = { width: 1280, height: 800 }): FrameConfig {
  return preset
    ? { id, name: preset.name, width: preset.width, height: preset.height, dpr: preset.dpr, landscape: false, emulation: { ...preset.emulation }, presetId: preset.id }
    : { id, name: "Custom", ...fallback, dpr: 1, landscape: false, emulation: { ...NO_EMULATION }, presetId: null };
}

/** The size the frame is shown at: its portrait size, swapped when rotated. Always within the allowed range. */
export function sizeOf(frame: Pick<FrameConfig, "width" | "height" | "landscape">): { width: number; height: number } {
  const w = clampSize(frame.width, 1280);
  const h = clampSize(frame.height, 800);
  return frame.landscape ? { width: h, height: w } : { width: w, height: h };
}

export const clampDpr = (dpr: number): number => clamp(Number.isFinite(dpr) ? dpr : 1, 1, 5);

/** The scale at which `sizes` fit side by side (gap apart) into `available`, never above 1. */
export function fitScale(sizes: ReadonlyArray<{ width: number; height: number }>, available: { width: number; height: number }, gap: number): number {
  if (sizes.length === 0 || available.width <= 0 || available.height <= 0) return 1;
  const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0) + gap * (sizes.length - 1);
  const tallest = Math.max(...sizes.map((s) => s.height));
  return clamp(Math.min(1, available.width / totalWidth, available.height / tallest), 0.1, 1);
}

/** Tailwind v4's default breakpoints (the `--breakpoint-*` theme values); TASK-56.6 replaces them with the project's own. */
export const TAILWIND_BREAKPOINTS: ReadonlyArray<{ name: string; min: number }> = [
  { name: "sm", min: 640 },
  { name: "md", min: 768 },
  { name: "lg", min: 1024 },
  { name: "xl", min: 1280 },
  { name: "2xl", min: 1536 },
];

/** The widest breakpoint a viewport of `width` CSS pixels reaches, or `base` below the first. */
export function breakpointOf(width: number, breakpoints: ReadonlyArray<{ name: string; min: number }> = TAILWIND_BREAKPOINTS): string {
  let name = "base";
  for (const bp of [...breakpoints].sort((a, b) => a.min - b.min)) if (width >= bp.min) name = bp.name;
  return name;
}

/** Which of an emulation's parts a platform cannot provide. Empty on WebView2 (CDP); see `unsupported`. */
export type EmulationPart = "touch-events" | "pointer-media" | "color-scheme" | "reduced-motion" | "user-agent" | "dpr-media";

export interface Capabilities {
  /** The backend has a CDP connection to the webview (Windows WebView2 in the desktop app, or any Chromium started with a debugging port). */
  cdp: boolean;
  platform: string;
}

/**
 * What cannot be emulated, for the label in the UI. Without CDP: only synthetic touch events (from the agent) and the
 * reported device pixel ratio work; media features and the user agent are the browser's own. With CDP: everything but
 * resolution media queries, because device metrics can only be overridden on a top-level target and a frame is not one.
 */
export function unsupported(caps: Capabilities): Array<{ part: EmulationPart; why: string }> {
  const out: Array<{ part: EmulationPart; why: string }> = [{ part: "dpr-media", why: "The pixel ratio is reported to scripts, but resolution media queries and image density follow the screen." }];
  if (!caps.cdp)
    out.push(
      { part: "pointer-media", why: "Needs the Chrome DevTools Protocol (Windows desktop app). Touch events are synthesised, but (hover: none) and (pointer: coarse) follow the real device." },
      { part: "color-scheme", why: "Needs the Chrome DevTools Protocol (Windows desktop app)." },
      { part: "reduced-motion", why: "Needs the Chrome DevTools Protocol (Windows desktop app)." },
      { part: "user-agent", why: "Needs the Chrome DevTools Protocol (Windows desktop app)." },
    );
  return out;
}

const percents = (value: unknown, count: number): number[] | null =>
  Array.isArray(value) && value.length === count && value.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100) ? (value as number[]) : null;

function sanitizeChrome(value: unknown): ChromeSettings | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<ChromeSettings>;
  const tab = (s: unknown, fallback: string) => (typeof s === "string" && /^[a-z]{1,20}$/.test(s) ? s : fallback);
  return {
    theme: c.theme === "light" || c.theme === "dark" ? c.theme : "system",
    panels: percents(c.panels, 3),
    column: percents(c.column, 2),
    drawerOpen: c.drawerOpen === true,
    drawerTab: tab(c.drawerTab, "code"),
    rightTab: tab(c.rightTab, "style"),
  };
}

/** Normalises a settings file read from disk: anything malformed is dropped rather than trusted. */
export function sanitizeSettings(value: unknown): ProjectSettings {
  const v = (value ?? {}) as Partial<ProjectSettings>;
  const emulation = (e: Partial<Emulation> | undefined): Emulation => ({
    touch: e?.touch === true,
    colorScheme: e?.colorScheme === "light" || e?.colorScheme === "dark" ? e.colorScheme : "auto",
    reducedMotion: e?.reducedMotion === true,
    userAgent: typeof e?.userAgent === "string" && e.userAgent ? e.userAgent.slice(0, 500) : null,
    ...(clampTextScale(e?.textScale) !== 1 ? { textScale: clampTextScale(e?.textScale) } : {}),
  });
  const text = (s: unknown, fallback: string) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 60) : fallback);
  const num = (n: unknown, fallback: number) => clamp(whole(Number(n), fallback), MIN_SIZE, MAX_SIZE);
  const presets = Array.isArray(v.presets)
    ? v.presets.slice(0, 50).map((p): DevicePreset => ({ id: text(p?.id, "preset"), name: text(p?.name, "Device"), width: num(p?.width, 390), height: num(p?.height, 844), dpr: clampDpr(Number(p?.dpr)), emulation: emulation(p?.emulation) }))
    : [];
  const frames = Array.isArray(v.frames)
    ? v.frames.slice(0, MAX_FRAMES).map(
        (f): FrameConfig => ({
          id: text(f?.id, "frame"),
          name: text(f?.name, "Frame"),
          width: num(f?.width, 1280),
          height: num(f?.height, 800),
          dpr: clampDpr(Number(f?.dpr)),
          landscape: f?.landscape === true,
          emulation: emulation(f?.emulation),
          presetId: typeof f?.presetId === "string" ? f.presetId : null,
        }),
      )
    : null;
  const chrome = sanitizeChrome(v.chrome);
  return { presets, frames: frames && frames.length ? frames : null, sync: v.sync === true, ...(chrome ? { chrome } : {}) };
}
