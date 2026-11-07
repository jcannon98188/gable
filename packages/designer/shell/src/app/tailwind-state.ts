// Tailwind mode's state: the project's design system (from the backend), the editing context (selected frame's breakpoint plus the
// state toolbar), the selected element's classes analysed against that context, and the temporary previews (hover over a palette
// entry, forced states). Writes go through EditState as the 56.4 `setAttr` class op, so there is one write path.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { AttrModel } from "../../../src/server/edit/types.js";
import type { AnalyzeResult, Breakpoint, ControlOption, PlanResult, SearchHit, TailwindInfo } from "../../../src/server/tailwind/types.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";

type Enabled = Extract<TailwindInfo, { enabled: true }>;

/** What makes a class conditional on the element (shown read-only as `conditional: <name>`). */
export interface ConditionalClass {
  name: string;
  attr: string;
}

type Attr = Pick<AttrModel, "name" | "kind" | "value">;

/**
 * Bindings that set the element's whole class list, overwriting what `class` says: `[attr.class]` (the attribute) and
 * `[className]` (the property). `[class]` and `[ngClass]` are not Gable (the runtime has no `class` property to bind), but
 * they are read as the same intent.
 */
const WHOLE_LIST = new Set(["[attr.class]", "[className]", "[class]", "[ngClass]"]);

/**
 * Whether the class list can be edited as text: false when a binding sets the whole list (edits to `class` would be
 * overwritten). `[class.x]="cond"` only toggles `x`, so the static list next to it stays editable.
 */
export function classListWritable(attrs: readonly Attr[]): boolean {
  if (attrs.some((a) => WHOLE_LIST.has(a.name))) return false;
  const a = attrs.find((x) => x.name === "class");
  return !a || (a.kind === "static" && !a.value.includes("{{"));
}

/** The classes the element gets from bindings, shown read-only: `[class.x]` as `x`, a whole-list binding as its expression. */
export function conditionalClasses(attrs: readonly Attr[]): ConditionalClass[] {
  const out: ConditionalClass[] = [];
  for (const a of attrs) {
    const m = /^\[class\.(.+)\]$/.exec(a.name);
    if (m) out.push({ name: m[1]!, attr: a.name });
    else if (WHOLE_LIST.has(a.name)) out.push({ name: a.value, attr: a.name });
    else if (a.name === "class" && a.value.includes("{{")) out.push({ name: a.value, attr: a.name });
  }
  return out;
}

export class TailwindState {
  static scope = "root";
  state = inject(DesignerState);
  edit = inject(EditState);

  /** Null until the backend answered. */
  info = signal<(TailwindInfo & { revision?: number }) | null>(null);
  enabled = computed<Enabled | null>(() => {
    const i = this.info();
    return i && i.enabled ? i : null;
  });
  /** Why the mode is off (not Tailwind v4, loader failed...). */
  offMessage = computed(() => {
    const i = this.info();
    return i && !i.enabled ? i.message : null;
  });

  /** The state variants being edited (`hover`, `dark`...), in the order they are written. */
  states = signal<string[]>([]);
  /** A breakpoint chosen in the Style tab. Otherwise the selected frame's width decides; changing frame goes back to following it. */
  pinned = signal<string | null>(null);
  breakpoint = computed(() => {
    const b = this.pinned() ?? this.state.frames.selectedBreakpoint();
    return b === "base" ? null : b;
  });
  unpinOnResize = effect(() => {
    this.state.frames.selectedBreakpoint();
    this.state.frames.selectedId();
    untracked(() => this.pinned.set(null));
  });
  pin(name: string): void {
    this.pinned.set(name === this.state.frames.selectedBreakpoint() ? null : name);
  }
  /** Tokens written since this element was selected: the panel marks them as new. */
  written = signal<string[]>([]);
  forgetWritten = effect(() => {
    this.state.picked()?.node.start;
    untracked(() => this.written.set([]));
  });
  breakpoints = computed<Breakpoint[]>(() => this.enabled()?.breakpoints ?? []);

  analysis = signal<AnalyzeResult | null>(null);
  /** Classes of the list that override each other outright: the Style panel says which one applies and offers removing the other. */
  conflicts = computed(() => (this.writable() ? (this.analysis()?.conflicts ?? []) : []));
  /** While a class is previewed: what writing it would replace (the plan is a dry run; nothing is written). */
  replaces = signal<{ token: string; removed: string[] } | null>(null);
  notice = signal<string | null>(null);
  busy = signal(false);

  /** The element's `class` attribute when it is plain text (so it can be edited); null when it is dynamic or missing. */
  classAttr = computed(() => this.edit.node()?.attrs.find((a) => a.name === "class") ?? null);
  classes = computed(() => {
    const a = this.classAttr();
    return a && a.kind === "static" ? a.value : "";
  });
  /** False when a binding sets the whole class list (`[attr.class]="expr"`): the class list is dynamic and read-only. */
  writable = computed(() => classListWritable(this.edit.node()?.attrs ?? []));
  conditionals = computed<ConditionalClass[]>(() => conditionalClasses(this.edit.node()?.attrs ?? []));

  #options = new Map<string, Promise<ControlOption[]>>();
  #revision = -1;

  booted = this.#boot();

  async #boot(): Promise<void> {
    await this.state.booted;
    await this.refresh();
    const c = this.state.config;
    if (!c) return;
    const events = new EventSource(`${c.backend}/api/events?token=${c.token}`);
    events.addEventListener("tailwind", () => void this.refresh());
  }

  /** Reads the design system's summary again (a stylesheet changed, so the theme or a plugin may have). */
  async refresh(): Promise<void> {
    const info = await this.state.api<TailwindInfo & { revision?: number }>("/api/tailwind/info").catch((e: unknown) => ({ enabled: false as const, message: e instanceof Error ? e.message : String(e) }));
    if (info.enabled && info.revision !== this.#revision) this.#options.clear();
    this.#revision = info.enabled ? (info.revision ?? 0) : -1;
    this.info.set(info);
    // The project's breakpoints, not Tailwind's defaults, decide which prefix the selected frame edits.
    this.state.frames.breakpoints.set(info.enabled ? info.breakpoints.map((b) => ({ name: b.name, min: b.min })) : null);
  }

  options(control: string): Promise<ControlOption[]> {
    let p = this.#options.get(control);
    if (!p) {
      p = this.state.api<ControlOption[]>(`/api/tailwind/options?control=${encodeURIComponent(control)}`).catch(() => []);
      this.#options.set(control, p);
    }
    return p;
  }

  // --- reading the element -----------------------------------------------------------------------------------------------

  analyse = effect(() => {
    const classes = this.classes();
    const bp = this.breakpoint();
    const states = this.states();
    const on = this.enabled() && this.edit.node();
    untracked(() => void this.#analyse(on ? { classes, breakpoint: bp, states } : null));
  });

  async #analyse(body: { classes: string; breakpoint: string | null; states: string[] } | null): Promise<void> {
    if (!body) return void this.analysis.set(null);
    const r = await this.state.api<AnalyzeResult>("/api/tailwind/analyze", body).catch(() => null);
    this.analysis.set(r);
  }

  // --- writing ----------------------------------------------------------------------------------------------------------

  /** Writes the class list the backend planned: one 56.4 `setAttr` edit of the static `class` attribute. */
  async #write(plan: PlanResult): Promise<boolean> {
    if (!plan.ok) {
      this.notice.set(plan.error);
      return false;
    }
    this.notice.set(null);
    this.clearPreview();
    const before = new Set(this.classes().split(/\s+/));
    this.written.update((w) => [...w, ...plan.classes.split(/\s+/).filter((c) => c && !before.has(c))]);
    await this.edit.edit((target) => (plan.classes === "" ? { op: "removeAttr", target, name: "class" } : { op: "setAttr", target, name: "class", value: plan.classes }));
    return true;
  }

  #ctx() {
    return { classes: this.classes(), breakpoint: this.breakpoint(), states: this.states() };
  }

  /** Sets a utility of the project's scale at the editing context (`p-4` at md with hover on writes `md:hover:p-4`). */
  async apply(utility: string): Promise<void> {
    if (!this.writable() || this.busy()) return;
    this.busy.set(true);
    try {
      await this.#write(await this.state.api<PlanResult>("/api/tailwind/plan", { ...this.#ctx(), utility }));
    } finally {
      this.busy.set(false);
    }
  }

  /** Writes a class exactly as typed, variants included (`hover:bg-brand`). */
  async applyTyped(token: string): Promise<void> {
    if (!this.writable() || this.busy() || !token.trim()) return;
    this.busy.set(true);
    try {
      await this.#write(await this.state.api<PlanResult>("/api/tailwind/plan", { ...this.#ctx(), token: token.trim() }));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(token: string): Promise<void> {
    if (!this.writable() || this.busy()) return;
    this.busy.set(true);
    try {
      await this.#write(await this.state.api<PlanResult>("/api/tailwind/plan", { ...this.#ctx(), remove: [token] }));
    } finally {
      this.busy.set(false);
    }
  }

  search(q: string): Promise<SearchHit[]> {
    const prefix = [this.variantPrefix()].join("");
    return this.state.api<SearchHit[]>("/api/tailwind/search", { q, prefix, limit: 40 }).catch(() => []);
  }

  /** `dark:md:hover:` as the plan composes it, so the palette's tokens read as what would be written. */
  variantPrefix(): string {
    const states = this.states();
    return [...(states.includes("dark") ? ["dark"] : []), ...(this.breakpoint() ? [this.breakpoint()!] : []), ...states.filter((s) => s !== "dark")].map((v) => v + ":").join("");
  }

  // --- temporary previews -----------------------------------------------------------------------------------------------

  #previewSeq = 0;

  /** Hover preview: the class's real CSS is injected and the class added to the selected element's DOM; nothing is written. */
  async preview(tokens: string[]): Promise<void> {
    const id = this.state.picked()?.node.id;
    const seq = ++this.#previewSeq;
    if (!id || tokens.length === 0) return this.clearPreview();
    const [{ css }, plan] = await Promise.all([
      this.state.api<{ css: string }>("/api/tailwind/css", { tokens }).catch(() => ({ css: "" })),
      tokens.length === 1 && this.writable() ? this.state.api<PlanResult>("/api/tailwind/plan", { ...this.#ctx(), token: tokens[0] }).catch(() => null) : null,
    ]);
    if (seq !== this.#previewSeq) return;
    this.replaces.set(plan?.ok && plan.added && plan.removed.length ? { token: plan.token, removed: plan.removed } : null);
    await this.#setPreview({ id, addClasses: tokens, css, mark: false, dark: false });
  }

  clearPreview(): void {
    this.#previewSeq++;
    this.replaces.set(null);
    void this.#applyForced();
  }

  async #setPreview(p: { id: string | null; addClasses: string[]; css: string; mark: boolean; dark: boolean }): Promise<void> {
    await this.state.preview.call("setPreview", p).catch(() => undefined);
  }

  forcedStates = effect(() => {
    this.states();
    this.state.picked();
    this.classes();
    this.enabled();
    untracked(() => void this.#applyForced());
  });

  /**
   * Forced-state preview. The pseudo-states CDP can force are forced on the element the agent marks (WebView2, or any Chromium with a
   * debugging port); the rest (disabled, dark, and every state without CDP) are an injected rule with the element's classes rewritten.
   */
  async #applyForced(): Promise<void> {
    const id = this.state.picked()?.node.id ?? null;
    const states = this.states();
    const nonce = this.state.preview.nonce;
    if (!id || !this.enabled() || states.length === 0) return void (await this.#setPreview({ id: null, addClasses: [], css: "", mark: false, dark: false }), await this.#release(nonce));
    const f = await this.state.api<{ css: string; dark: boolean; cdp: string[]; injected: string[] }>("/api/tailwind/force", { classes: this.classes(), states, nonce }).catch(() => null);
    if (!f) return;
    this.forced.set({ cdp: f.cdp, injected: f.injected });
    await this.#setPreview({ id, addClasses: [], css: f.css, mark: true, dark: f.dark });
    // Marks are in the DOM now; CDP forces the pseudo-classes on them.
    await this.state.api("/api/tailwind/force", { classes: this.classes(), states, nonce, apply: true }).catch(() => undefined);
  }

  async #release(nonce: string): Promise<void> {
    this.forced.set({ cdp: [], injected: [] });
    await this.state.api("/api/tailwind/force", { classes: "", states: [], nonce, apply: true }).catch(() => undefined);
  }

  /** Which of the toolbar's states are forced by CDP and which by an injected rule (shown under the toolbar). */
  forced = signal<{ cdp: string[]; injected: string[] }>({ cdp: [], injected: [] });
}
