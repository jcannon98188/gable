// The frames on the canvas. Each frame is one iframe with its own app instance, so each has its own PreviewClient (its own
// nonce, its own agent). The set owns the selected frame (the one the panels inspect, and the one Tailwind mode will read
// its width and breakpoint from), fit-to-screen scaling, saved device presets and the emulation each frame asks for.
import { computed, signal } from "@gable/core";
import {
  BUILTIN_PRESETS,
  EMPTY_SETTINGS,
  MAX_FRAMES,
  breakpointOf,
  clampDpr,
  clampSize,
  fitScale,
  frameFrom,
  sizeOf,
  type Capabilities,
  type DevicePreset,
  type Emulation,
  type FrameConfig,
  type ProjectSettings,
} from "../../../src/devices.js";
import { PreviewClient, type AgentEvent } from "./preview-client.js";

export type Connection = "connecting" | "ready" | "incompatible" | "failed";

/** What a frame reports about its own emulation. */
export interface EmulationStatus {
  /** `applied`: CDP took it; `page-only`: only what the agent can do in the page; `failed`: CDP was expected but refused. */
  kind: "idle" | "applied" | "page-only" | "failed";
  /** The engine has no TouchEvent constructor, so touch input could not be synthesised. */
  touchEvents: boolean;
  error: string | null;
}

/** One frame: its configuration, its preview client and what is known about its connection. */
export class Frame {
  readonly client: PreviewClient;
  /**
   * Which origin the frame's app runs on (see `frameUrl`). Frames must be different sites: over CDP, touch and media
   * emulation apply to the whole renderer process, and Chromium gives each site its own process, so two frames of one
   * site could not be emulated differently. A separate origin also gives each frame its own localStorage and cookies.
   */
  readonly slot: number;
  readonly config;
  readonly connection = signal<Connection>("connecting");
  readonly emulation = signal<EmulationStatus>({ kind: "idle", touchEvents: true, error: null });
  /** The rendered size: the portrait size, swapped when rotated. */
  readonly size = computed(() => sizeOf(this.config()));
  /** Emulation requests run one after another, each with the frame's config at that moment, so the last edit wins. */
  applying: Promise<void> = Promise.resolve();

  constructor(config: FrameConfig, slot: number, onEvent: (frame: Frame, message: AgentEvent) => void) {
    this.slot = slot;
    this.config = signal(config);
    this.client = new PreviewClient((message) => onEvent(this, message));
  }

  get id(): string {
    return this.config().id;
  }
}

/**
 * The URL a frame loads: the project's page for the first slot, the same page on `f<slot>.localhost` for the others (every
 * `*.localhost` name is loopback in Chromium and WebKit, and Vite accepts them). Other hosts are left alone.
 */
export function frameUrl(url: string, slot: number): string {
  const u = new URL(url);
  if (slot > 0 && u.hostname === "localhost") u.hostname = `f${slot}.localhost`;
  return u.href;
}

export interface FrameHost {
  api<T>(path: string, body?: unknown): Promise<T>;
  onEvent(frame: Frame, message: AgentEvent): void;
}

/** Space between frames and around the board, and the height of a frame's title row, in CSS pixels (the board's layout). */
export const BOARD = { gap: 24, padding: 16, header: 28 } as const;

const newId = () => Math.random().toString(36).slice(2, 8);

export class FrameSet {
  readonly #host: FrameHost;
  readonly frames = signal<Frame[]>([]);
  readonly selectedId = signal("");
  /** `fit`: scale every frame down together until they all fit the board; or a fixed zoom. */
  readonly zoom = signal<"fit" | number>("fit");
  /** The board's size, reported by the canvas. */
  readonly available = signal({ width: 0, height: 0 });
  readonly sync = signal(false);
  readonly capabilities = signal<Capabilities>({ cdp: false, platform: "" });
  readonly saved = signal<DevicePreset[]>([]);

  readonly selected = computed(() => this.frames().find((f) => f.id === this.selectedId()) ?? this.frames()[0]!);
  /** The width the selected frame renders at, and the Tailwind breakpoint it reaches (TASK-56.6 drives its variants from these). */
  readonly selectedWidth = computed(() => this.selected().size().width);
  readonly selectedBreakpoint = computed(() => breakpointOf(this.selectedWidth()));
  readonly presets = computed<DevicePreset[]>(() => [...BUILTIN_PRESETS, ...this.saved()]);
  readonly scale = computed(() => {
    const zoom = this.zoom();
    if (zoom !== "fit") return zoom;
    const { width, height } = this.available();
    return fitScale(
      this.frames().map((f) => f.size()),
      { width: width - BOARD.padding * 2, height: height - BOARD.padding * 2 - BOARD.header },
      BOARD.gap,
    );
  });

  #loaded = false;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(host: FrameHost) {
    this.#host = host;
    const first = this.#make(frameFrom(newId(), BUILTIN_PRESETS.find((p) => p.id === "laptop") ?? null));
    this.frames.set([first]);
    this.selectedId.set(first.id);
  }

  #freeSlot(): number {
    const used = new Set(this.frames().map((f) => f.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  #make(config: FrameConfig, slot = this.#freeSlot()): Frame {
    return new Frame(config, slot, (frame, message) => this.#host.onEvent(frame, message));
  }

  /** Reads what the backend knows: whether CDP emulation exists, and the project's saved presets and layout. */
  async load(): Promise<void> {
    const [capabilities, settings] = await Promise.all([
      this.#host.api<Capabilities>("/api/devices/capabilities").catch((): Capabilities => ({ cdp: false, platform: "" })),
      this.#host.api<ProjectSettings>("/api/devices/settings").catch((): ProjectSettings => ({ ...EMPTY_SETTINGS })),
    ]);
    this.capabilities.set(capabilities);
    this.saved.set(settings.presets);
    this.sync.set(settings.sync);
    if (settings.frames) {
      const frames = settings.frames.map((c, slot) => this.#make(c, slot));
      this.frames.set(frames);
      this.selectedId.set(frames[0]!.id);
    }
    this.#loaded = true;
  }

  // --- frames -------------------------------------------------------------

  select(id: string): void {
    if (this.frames().some((f) => f.id === id)) this.selectedId.set(id);
  }

  add(presetId?: string): Frame | null {
    if (this.frames().length >= MAX_FRAMES) return null;
    const preset = this.presets().find((p) => p.id === presetId) ?? BUILTIN_PRESETS.find((p) => p.id === "iphone-15")!;
    const frame = this.#make(frameFrom(newId(), preset));
    this.frames.update((all) => [...all, frame]);
    this.#persist();
    return frame;
  }

  remove(id: string): void {
    if (this.frames().length <= 1) return;
    const next = this.frames().filter((f) => f.id !== id);
    this.frames.set(next);
    if (this.selectedId() === id) this.selectedId.set(next[0]!.id);
    this.#persist();
  }

  /** Edits a frame's configuration. The size and pixel ratio are clamped; a hand edit makes the frame custom. */
  update(id: string, patch: Partial<Omit<FrameConfig, "id">>): void {
    const frame = this.frames().find((f) => f.id === id);
    if (!frame) return;
    const before = frame.config();
    const next: FrameConfig = { ...before, ...patch, emulation: { ...before.emulation, ...patch.emulation } };
    const sizeEdit = "width" in patch || "height" in patch || "dpr" in patch;
    frame.config.set({
      ...next,
      width: clampSize(next.width),
      height: clampSize(next.height),
      dpr: clampDpr(next.dpr),
      presetId: sizeEdit && !("presetId" in patch) ? null : next.presetId,
    });
    if (patch.emulation || "dpr" in patch) void this.applyEmulation(frame);
    this.#persist();
  }

  applyPreset(id: string, presetId: string): void {
    const preset = this.presets().find((p) => p.id === presetId);
    const frame = this.frames().find((f) => f.id === id);
    if (!preset || !frame) return;
    const { landscape } = frame.config();
    frame.config.set({ ...frameFrom(id, preset), name: preset.name, landscape });
    void this.applyEmulation(frame);
    this.#persist();
  }

  rotate(id: string): void {
    const frame = this.frames().find((f) => f.id === id);
    if (frame) this.update(id, { landscape: !frame.config().landscape });
  }

  // --- presets ------------------------------------------------------------

  /** Saves the frame's size, pixel ratio and emulation as a preset of this project. */
  savePreset(id: string, name: string): DevicePreset | null {
    const frame = this.frames().find((f) => f.id === id);
    const trimmed = name.trim();
    if (!frame || !trimmed) return null;
    const c = frame.config();
    const preset: DevicePreset = { id: `saved-${newId()}`, name: trimmed, width: c.width, height: c.height, dpr: c.dpr, emulation: { ...c.emulation } };
    this.saved.update((all) => [...all.filter((p) => p.name !== trimmed), preset]);
    this.update(id, { name: trimmed, presetId: preset.id });
    return preset;
  }

  deletePreset(presetId: string): void {
    this.saved.update((all) => all.filter((p) => p.id !== presetId));
    for (const f of this.frames()) if (f.config().presetId === presetId) f.config.update((c) => ({ ...c, presetId: null }));
    this.#persist();
  }

  setSync(on: boolean): void {
    this.sync.set(on);
    this.#persist();
  }

  // --- emulation ----------------------------------------------------------

  /**
   * Applies a frame's emulation: the part the page can do itself (synthetic touch events, the pixel ratio scripts read)
   * through the agent, and the rest over CDP where the backend has it. Safe to call any time; a frame that is not ready
   * yet is handled when it reports `ready`.
   */
  applyEmulation(frame: Frame): Promise<void> {
    return (frame.applying = frame.applying.then(() => this.#applyEmulation(frame)));
  }

  async #applyEmulation(frame: Frame): Promise<void> {
    if (frame.connection() !== "ready") return;
    const { emulation, dpr } = frame.config();
    let touchEvents = true;
    try {
      touchEvents = (await frame.client.call("setEmulation", { touch: emulation.touch, dpr })).touchEvents;
    } catch {
      // an older agent: nothing the page can do
    }
    if (!this.capabilities().cdp) return frame.emulation.set({ kind: "page-only", touchEvents, error: null });
    const result = await this.#host
      .api<{ ok: boolean; error?: string }>("/api/devices/emulation", { nonce: frame.client.nonce, emulation: emulation satisfies Emulation })
      .catch((e: unknown) => ({ ok: false, error: String(e) }));
    frame.emulation.set({ kind: result.ok ? "applied" : "failed", touchEvents, error: result.ok ? null : (result.error ?? "failed") });
  }

  /** Opens the project's page in the system browser against the same dev server. */
  async openInBrowser(path = "/"): Promise<void> {
    await this.#host.api("/api/devices/open-external", { path });
  }

  // --- persistence --------------------------------------------------------

  #persist(): void {
    if (!this.#loaded) return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      const settings: ProjectSettings = { presets: this.saved(), frames: this.frames().map((f) => f.config()), sync: this.sync() };
      void this.#host.api("/api/devices/settings", settings).catch(() => undefined);
    }, 400);
  }
}
