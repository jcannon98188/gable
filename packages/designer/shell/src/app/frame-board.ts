// The canvas: the frame toolbar, the environment row, and a dot-grid board of frames side by side. A frame is an iframe sized in CSS
// pixels and scaled as a whole (fit-to-screen, or a fixed zoom), so a 1920px desktop and a 390px phone can be seen together.
import { computed, effect, html, inject, input, signal, untracked, viewChild } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { TEXT_SCALES, clampTextScale, unsupported } from "../../../src/devices.js";
import { UiButton } from "../components/ui/button.js";
import { UiIcon } from "../lib/ui/icon.js";
import { UiSelect } from "../components/ui/select.js";
import { UiToggleGroup, type ToggleGroupItem } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { CanvasOverlays } from "./canvas-overlays.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { frameUrl, type Frame } from "./frames.js";
import { PageState } from "./page-state.js";
import { ProjectState } from "./project-state.js";

/** One frame: its header (name, size, what it can do) and the scaled iframe. Clicking the name selects it. */
export class FrameView {
  static meta = {
    selector: "app-frame-view",
    host: { class: "block shrink-0" },
    imports: [UiButton, UiIcon, UiTooltip],
    template: html`
      <div class="fh" [class.sel]="selected()" [style.width]="boxWidth()">
        <button class="name" (click)="select()">{{ title() }}</button>
        <span class="mono dim">{{ dims() }}</span>
        <span class="chip" [class.ok]="live()" [class.warn]="!live()" data-part="frame-status">{{ status() }}</span>
        <span class="spacer"></span>
        <button uiButton variant="ghost" size="icon" class="btn sm icon" uiTooltip="Rotate this frame" [attr.aria-label]="rotateLabel()" (click)="rotate()"><svg uiIcon="rotate" class="ico-sm"></svg></button>
        <button uiButton variant="ghost" size="icon" class="btn sm icon" uiTooltip="Duplicate this frame" [attr.aria-label]="duplicateLabel()" [disabled]="full()" (click)="duplicate()"><svg uiIcon="copy" class="ico-sm"></svg></button>
        <button uiButton variant="ghost" size="icon" class="btn sm icon" uiTooltip="Close this frame" [attr.aria-label]="closeLabel()" [disabled]="single()" (click)="close()"><svg uiIcon="x" class="ico-sm"></svg></button>
      </div>
      <div class="frame" [class.sel]="selected()" [attr.data-frame-id]="frameId()" [style.width]="boxWidth()" [style.height]="boxHeight()">
        <iframe
          #frame
          [attr.title]="title()"
          class="absolute top-0 left-0 border-0 bg-white"
          style="transform-origin: 0 0"
          [style.width]="width()"
          [style.height]="height()"
          [style.transform]="transform()"
        ></iframe>
      </div>
    `,
  };
  state = inject(DesignerState);
  frame = input.required<Frame>();
  iframe = viewChild<HTMLIFrameElement>("frame");

  attach = effect(() => {
    const el = this.iframe();
    const url = this.state.frameUrl();
    if (el && url) untracked(() => this.state.attachFrame(this.frame(), el, frameUrl(url, this.frame().slot)));
  });

  frameId = computed(() => this.frame().id);
  size = computed(() => this.frame().size());
  scale = computed(() => this.state.frames.scale());
  width = computed(() => `${this.size().width}px`);
  height = computed(() => `${this.size().height}px`);
  transform = computed(() => `scale(${this.scale()})`);
  boxWidth = computed(() => `${Math.round(this.size().width * this.scale())}px`);
  boxHeight = computed(() => `${Math.round(this.size().height * this.scale())}px`);
  selected = computed(() => this.state.frames.selected() === this.frame());
  title = computed(() => this.frame().config().name);
  dims = computed(() => {
    const { width, height } = this.size();
    const dpr = this.frame().config().dpr;
    return `${width} × ${height} · ${Math.round(this.scale() * 100)}%${dpr !== 1 ? ` · DPR ${dpr}` : ""}`;
  });
  live = computed(() => this.frame().connection() === "ready");
  status = computed(() => (this.live() ? "live" : this.frame().connection()));
  full = computed(() => this.state.frames.frames().length >= 6);
  single = computed(() => this.state.frames.frames().length <= 1);
  rotateLabel = computed(() => `Rotate ${this.title()}`);
  duplicateLabel = computed(() => `Duplicate ${this.title()}`);
  closeLabel = computed(() => `Close ${this.title()}`);

  select(): void {
    this.state.selectFrame(this.frame().id);
  }
  rotate(): void {
    this.state.frames.rotate(this.frame().config().id);
  }
  /** A new frame with this one's preset; a custom size is copied over, since it has no preset to start from. */
  duplicate(): void {
    const added = this.state.frames.duplicate(this.frame().config().id);
    if (added) this.state.selectFrame(added.id);
  }
  close(): void {
    this.state.frames.remove(this.frame().config().id);
    this.state.selectFrame(this.state.frames.selected().id);
  }
}

const SIZES: Array<{ value: string; label: string; preset: string }> = [
  { value: "mobile", label: "Mobile", preset: "iphone-15" },
  { value: "tablet", label: "Tablet", preset: "ipad-mini" },
  { value: "desktop", label: "Desktop", preset: "laptop" },
];

/** The frame toolbar (what to show and which frames) and the environment row (how the selected frame emulates a device). */
export class DeviceBar {
  static meta = {
    selector: "app-device-bar",
    host: { class: "block" },
    imports: [UiButton, UiIcon, UiSelect, UiToggleGroup, UiTooltip],
    template: html`
      <div class="ctool">
        @if (isPage()) {
          <button uiButton variant="ghost" size="icon" class="btn icon" [uiTooltip]="page.backTitle()" aria-label="Back" data-part="page-back" [disabled]="!page.canBack()" (click)="page.back()"><svg uiIcon="arrow-left" class="ico"></svg></button>
          <button uiButton variant="ghost" size="icon" class="btn icon" [uiTooltip]="page.forwardTitle()" aria-label="Forward" data-part="page-forward" [disabled]="!page.canForward()" (click)="page.forward()"><svg uiIcon="arrow-right" class="ico"></svg></button>
          <button uiButton variant="ghost" size="icon" class="btn icon" uiTooltip="Reload the page" aria-label="Reload the page" data-part="page-reload" [disabled]="!page.hasRouter()" (click)="page.go()"><svg uiIcon="refresh" class="ico"></svg></button>
          <label class="fld ghost" style="flex: 1 1 200px">
            <svg uiIcon="lock" class="ico-sm dim"></svg>
            <span class="mono dim">{{ host() }}</span>
            <input
              class="mono min-w-0 flex-1 bg-transparent outline-none"
              aria-label="URL"
              spellcheck="false"
              [value]="page.urlText()"
              [disabled]="!page.hasRouter()"
              (input)="typed($event.currentTarget.value)"
              (keydown)="onUrlKey($event.key)"
              (blur)="page.editing.set(false)"
            />
          </label>
          <button uiButton variant="outline" size="sm" class="btn" [disabled]="!page.hasRouter()" (click)="page.go()">Go</button>
          @if (routeChip()) {
            <span class="chip mono" uiTooltip="The route matching this URL">{{ routeChip() }}</span>
          }
        } @else {
          <span class="dim">Scenario</span>
          <ui-select triggerClass="fld-select w-44" placeholder="No Scenarios" [items]="sceneItems()" [disabled]="noScenes()" [(value)]="scenePick"></ui-select>
        }
        <span class="vsep"></span>
        @for (f of frameChips(); track f.id) {
          <button class="chip" [class.on]="f.selected" [attr.aria-pressed]="f.pressed" (click)="state.selectFrame(f.id)">{{ f.name }}</button>
        }
        <button uiButton variant="outline" size="sm" class="btn" [disabled]="full()" (click)="add()"><svg uiIcon="plus" class="ico-sm"></svg>Add frame</button>
        <label class="chip" [class.on]="sync()" uiTooltip="Repeat clicks, typing and scrolling from one frame in the others (Interact mode)">
          <input class="sr-only" type="checkbox" [checked]="sync()" (change)="onSync($event.currentTarget.checked)" />
          Sync
        </label>
        @if (overlays.syncText()) {
          <span class="chip on mono" data-part="sync-selection" uiTooltip="The selected element, shown in every frame that renders it">{{ overlays.syncText() }}</span>
        }
        <span class="spacer"></span>
        <select class="fld fld-zoom" aria-label="Zoom" [value]="zoomValue()" (change)="onZoom($event.currentTarget.value)">
          <option value="fit">Fit</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
        </select>
      </div>
      <div class="ctool env">
        <span class="dim" data-part="environment-of">{{ environmentLabel() }}</span>
        <ui-toggle-group class="seg small" data-part="sizes" [items]="sizes" [(value)]="sizeValue" type="single" variant="outline" size="sm"></ui-toggle-group>
        <select class="fld fld-device" aria-label="Device" (change)="onPreset($event.currentTarget.value)">
          <option value="custom" [selected]="isCustom()">Custom</option>
          @for (p of presetItems(); track p.id) {
            <option [value]="p.id" [selected]="p.selected">{{ p.label }}</option>
          }
        </select>
        <input class="fld fld-num mono" type="number" aria-label="Width" [value]="size().width" (change)="onWidth($event.currentTarget.value)" />
        <span class="dim">×</span>
        <input class="fld fld-num mono" type="number" aria-label="Height" [value]="size().height" (change)="onHeight($event.currentTarget.value)" />
        <label class="flex items-center gap-1 dim">
          DPR
          <input class="fld fld-dpr mono" type="number" aria-label="DPR" step="0.25" min="1" max="5" [value]="config().dpr" (change)="onDpr($event.currentTarget.value)" />
        </label>
        <button uiButton variant="ghost" size="sm" class="btn sm" uiTooltip="Rotate" (click)="rotate()">{{ orientation() }}</button>
        <span class="chip mono" uiTooltip="The breakpoint the selected frame reaches" data-part="frame-breakpoint">{{ breakpoint() }}</span>
        <span class="vsep"></span>
        <label class="flex items-center gap-1">
          Color scheme
          <select class="fld fld-scheme" [value]="config().emulation.colorScheme" (change)="onScheme($event.currentTarget.value)">
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          @if (mediaNote()) {
            <span class="chip off" [uiTooltip]="mediaNote()" tabindex="0">unsupported</span>
          }
        </label>
        <label class="chip" [class.on]="config().emulation.reducedMotion">
          <input class="sr-only" type="checkbox" [checked]="config().emulation.reducedMotion" (change)="onMotion($event.currentTarget.checked)" />
          Reduced motion
          @if (mediaNote()) {
            <span class="dim" [uiTooltip]="mediaNote()">unsupported</span>
          }
        </label>
        <label class="chip" [class.on]="config().emulation.touch">
          <input class="sr-only" type="checkbox" [checked]="config().emulation.touch" (change)="onTouch($event.currentTarget.checked)" />
          Touch
          @if (touchNote()) {
            <span class="dim" [uiTooltip]="touchNote()">{{ touchLabel() }}</span>
          }
        </label>
        <label class="flex items-center gap-1" uiTooltip="Text size: the page's root font size times this, so rem-based type follows (px does not)">
          Aa
          <select class="fld fld-text mono" aria-label="Text size" data-part="text-scale" (change)="onTextScale($event.currentTarget.value)">
            @for (t of textScales(); track t.value) {
              <option [value]="t.value" [selected]="t.selected">{{ t.label }}</option>
            }
          </select>
        </label>
        <span class="chip" [class.off]="uaNote()" [uiTooltip]="uaTitle()" tabindex="0">
          User agent: {{ uaLabel() }}
          @if (uaNote()) {
            <span class="dim" [uiTooltip]="uaNote()">unsupported</span>
          }
        </span>
        @if (failure()) {
          <span class="chip err" [uiTooltip]="failure()" tabindex="0">CDP failed</span>
        }
        <span class="spacer"></span>
        <input class="fld fld-preset" placeholder="Preset name" aria-label="Preset name" [value]="presetName()" (input)="presetName.set($event.currentTarget.value)" />
        <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="cannotSave()" (click)="savePreset()">Save preset</button>
        @if (savedCurrent()) {
          <button uiButton variant="ghost" size="sm" class="btn sm" data-part="delete-preset" (click)="deletePreset()">Delete preset</button>
        }
      </div>
    `,
  };
  state = inject(DesignerState);
  page = inject(PageState);
  chrome = inject(ChromeState);
  overlays = inject(CanvasOverlays);
  frames = this.state.frames;
  presetName = signal("");
  sizes: ToggleGroupItem[] = SIZES.map((s) => ({ value: s.value, label: s.label }));

  isPage = computed(() => this.state.target().kind === "page");
  frame = computed(() => this.frames.selected());
  config = computed(() => this.frame().config());
  size = computed(() => this.frame().size());
  environmentLabel = computed(() => `Environment · ${this.config().name}`);
  orientation = computed(() => (this.config().landscape ? "Landscape" : "Portrait"));
  breakpoint = computed(() => `${this.frames.selectedWidth()}px · ${this.frames.selectedBreakpoint()}`);
  presetItems = computed(() => this.frames.presets().map((p) => ({ id: p.id, label: `${p.name} (${p.width}×${p.height})`, selected: p.id === this.config().presetId })));
  isCustom = computed(() => this.config().presetId === null);
  zoomValue = computed(() => String(this.frames.zoom()));
  sync = computed(() => this.frames.sync());
  full = computed(() => this.frames.frames().length >= 6);
  frameChips = computed(() => {
    const current = this.frames.selected();
    return this.frames.frames().map((f) => ({ id: f.id, name: f.config().name, selected: f === current, pressed: String(f === current) }));
  });
  savedCurrent = computed(() => this.frames.saved().some((p) => p.id === this.config().presetId));
  cannotSave = computed(() => this.presetName().trim() === "");

  // Mobile/Tablet/Desktop are shortcuts onto three built-in presets; the segment shows nothing pressed for any other device.
  sizeValue = signal<string[]>([]);
  followSize = effect(() => {
    const preset = this.config().presetId;
    const match = SIZES.find((s) => s.preset === preset);
    untracked(() => this.sizeValue.set(match ? [match.value] : []));
  });
  chooseSize = effect(() => {
    const value = this.sizeValue()[0];
    const size = SIZES.find((s) => s.value === value);
    untracked(() => {
      if (size && size.preset !== this.config().presetId) this.frames.applyPreset(this.config().id, size.preset);
    });
  });

  sceneItems = computed(() => (this.state.sceneInfo()?.scenes ?? []).map((s) => ({ value: s.name, label: s.name })));
  noScenes = computed(() => this.sceneItems().length === 0);
  scenePick = signal("");
  followScene = effect(() => {
    const scene = this.state.scene() ?? "";
    untracked(() => this.scenePick.set(scene));
  });
  chooseScene = effect(() => {
    const picked = this.scenePick();
    if (picked && picked !== untracked(this.state.scene)) untracked(() => void this.state.chooseScene(picked));
  });

  host = computed(() => {
    const url = this.state.project()?.previewUrl;
    if (!url) return "";
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  });
  routeChip = computed(() => {
    const active = this.page.rows().filter((r) => r.active);
    const last = active[active.length - 1];
    return last ? `route · ${last.path}` : "";
  });

  // What this platform cannot emulate, as labels (see `unsupported` in devices.ts).
  gaps = computed(() => unsupported(this.frames.capabilities()));
  why = (part: string) => this.gaps().find((g) => g.part === part)?.why ?? "";
  mediaNote = computed(() => this.why("color-scheme"));
  uaNote = computed(() => this.why("user-agent"));
  touchNote = computed(() => {
    const status = this.frame().emulation();
    if (!status.touchEvents) return "This engine has no TouchEvent constructor, so touch input cannot be synthesised here.";
    return this.why("pointer-media");
  });
  touchLabel = computed(() => (this.frame().emulation().touchEvents ? "touch events only" : "unsupported"));
  failure = computed(() => this.frame().emulation().error ?? "");
  uaLabel = computed(() => {
    const ua = this.config().emulation.userAgent;
    return ua ? (/iPhone|iPad|Android/.exec(ua)?.[0] ?? "custom") : "default";
  });
  textScales = computed(() => {
    const now = this.config().emulation.textScale ?? 1;
    const all = (TEXT_SCALES as readonly number[]).includes(now) ? [...TEXT_SCALES] : [...TEXT_SCALES, now].sort((a, b) => a - b);
    return all.map((v) => ({ value: String(v), label: `${Math.round(v * 100)}%`, selected: v === now }));
  });
  uaTitle = computed(() => this.uaNote() || this.config().emulation.userAgent || "The webview's own user agent");

  typed(text: string): void {
    this.page.editing.set(true);
    this.page.urlText.set(text);
  }
  onUrlKey(key: string): void {
    if (key === "Enter") void this.page.go();
  }
  onPreset(value: string): void {
    if (value !== "custom") this.frames.applyPreset(this.config().id, value);
    else this.frames.update(this.config().id, { presetId: null });
  }
  // The displayed size is the rotated one: a landscape frame's width is its portrait height.
  onWidth(value: string): void {
    this.frames.update(this.config().id, this.config().landscape ? { height: Number(value) } : { width: Number(value) });
  }
  onHeight(value: string): void {
    this.frames.update(this.config().id, this.config().landscape ? { width: Number(value) } : { height: Number(value) });
  }
  onDpr(value: string): void {
    this.frames.update(this.config().id, { dpr: Number(value) });
  }
  rotate(): void {
    this.frames.rotate(this.config().id);
  }
  onZoom(value: string): void {
    this.frames.zoom.set(value === "fit" ? "fit" : Number(value));
  }
  add(): void {
    const added = this.frames.add();
    if (added) this.state.selectFrame(added.id);
  }
  onSync(on: boolean): void {
    this.frames.setSync(on);
  }
  onTouch(on: boolean): void {
    this.frames.update(this.config().id, { emulation: { ...this.config().emulation, touch: on } });
  }
  onScheme(value: string): void {
    this.frames.update(this.config().id, { emulation: { ...this.config().emulation, colorScheme: value === "light" || value === "dark" ? value : "auto" } });
  }
  onTextScale(value: string): void {
    this.frames.update(this.config().id, { emulation: { ...this.config().emulation, textScale: clampTextScale(value) } });
  }
  onMotion(on: boolean): void {
    this.frames.update(this.config().id, { emulation: { ...this.config().emulation, reducedMotion: on } });
  }
  savePreset(): void {
    if (this.frames.savePreset(this.config().id, this.presetName())) this.presetName.set("");
  }
  deletePreset(): void {
    const id = this.config().presetId;
    if (id) this.frames.deletePreset(id);
  }
}

/** The path to the selected element, innermost last; each step selects that ancestor. */
export class SelectionCrumb {
  static meta = {
    selector: "app-crumb",
    host: { class: "block" },
    imports: [UiIcon, UiTooltip],
    template: html`
      <nav class="crumb" aria-label="Selected element">
        @if (hasSelection()) {
          @for (step of steps(); track step.id) {
            <button class="step" [class.cur]="step.current" [attr.aria-current]="step.ariaCurrent" (click)="choose(step.id)">{{ step.tag }}</button>
            @if (!step.current) {
              <span class="dim">›</span>
            }
          }
          <span class="spacer"></span>
          <span class="mono dim truncate" [attr.title]="where()">{{ where() }}</span>
        } @else if (ready()) {
          <span class="dim">Select something to edit, or press Ctrl K to search and run commands.</span>
        } @else {
          <span class="dim">Waiting for the preview to connect.</span>
        }
      </nav>
    `,
  };
  state = inject(DesignerState);
  ready = computed(() => this.state.connection() === "ready");
  hasSelection = computed(() => !!this.state.picked());
  steps = computed(() => {
    const p = this.state.picked();
    if (!p) return [];
    return [...p.chain].reverse().map((n) => ({ id: n.id, tag: n.tag, current: n.id === p.node.id, ariaCurrent: n.id === p.node.id ? "true" : null }));
  });
  where = computed(() => {
    const s = this.state.picked()?.source;
    if (!s) return "";
    return "error" in s ? s.error : `${this.state.relative(s.file)}:${s.from.line}–${s.to.line}`;
  });
  choose(id: string): void {
    void this.state.preview.call("selectNode", { id }).catch(() => undefined);
  }
}

/** The preview area: the toolbars above a scrollable board of frames, with what is wrong drawn over it. */
export class FrameBoard {
  static meta = {
    selector: "app-frame-board",
    host: { class: "block h-full" },
    imports: [DeviceBar, FrameView, SelectionCrumb, UiButton],
    template: html`
      <div class="flex h-full flex-col">
        <div #board class="canvas relative min-h-0 flex-1 overflow-auto">
          <div class="flex w-max items-start gap-6 p-4">
            @for (f of frames(); track f.id) {
              <app-frame-view [frame]="f"></app-frame-view>
            }
          </div>
          @if (failure(); as why) {
            <div class="canvas-msg" role="alert" data-part="server-failure">
              <div class="card msg-card">
                <span class="chip err">Disconnected</span>
                <strong>{{ failureTitle() }}</strong>
                <span class="dim">{{ why }} Your files are untouched.</span>
                @if (projects.logTail()) {
                  <pre class="code msg-code" data-part="failure-log">{{ projects.logTail() }}</pre>
                }
                @if (projects.actionError(); as err) {
                  <span class="callout err">{{ err }}</span>
                }
                <div class="flex justify-end gap-2">
                  @if (projects.canInstall()) {
                    <button uiButton variant="outline" size="sm" class="btn" data-part="install-open" (click)="chrome.dialog.set('connect')">Install…</button>
                  }
                  <button uiButton variant="outline" size="sm" class="btn" data-part="open-log" (click)="chrome.dialog.set('server-log')">Open log</button>
                  <button uiButton variant="default" size="sm" class="btn" data-part="retry" [disabled]="projects.restarting() || projects.installing()" (click)="retry()">{{ restartLabel() }}</button>
                </div>
              </div>
            </div>
          } @else if (message()) {
            <div class="canvas-msg" role="status"><span class="dim">{{ message() }}</span></div>
          }
        </div>
        <app-crumb></app-crumb>
      </div>
    `,
  };
  state = inject(DesignerState);
  board = viewChild<HTMLElement>("board");
  frames = computed(() => this.state.frames.frames());
  chrome = inject(ChromeState);
  projects = inject(ProjectState);
  failure = computed(() => this.state.error() ?? this.state.project()?.error ?? null);
  restartLabel = computed(() => (this.projects.restarting() ? "Restarting…" : "Restart server"));
  failureTitle = computed(() => (this.state.project()?.installing ? "Installing the project's dependencies" : /stopped/.test(this.failure() ?? "") ? "The dev server stopped" : "The project's dev server is not available"));
  message = computed(() => {
    const s = this.state;
    if (s.incompatible()) return s.incompatible();
    if (s.project()?.installing) return "Installing the project's dependencies…";
    if (!s.project()?.ready) return "Starting the project's dev server…";
    return null;
  });

  /** Restarts the project's Vite in the backend; the frames reload when it answers again. */
  retry(): void {
    void this.projects.restart();
  }

  /** Reports the board's size so fit-to-screen can scale all frames to it. */
  measure = (() => {
    let observer: ResizeObserver | undefined;
    currentScope()?.onDispose(() => observer?.disconnect());
    effect(() => {
      const el = this.board();
      if (!el || typeof ResizeObserver === "undefined") return;
      untracked(() => {
        observer?.disconnect();
        const report = () => this.state.frames.available.set({ width: el.clientWidth, height: el.clientHeight });
        observer = new ResizeObserver(report);
        observer.observe(el);
        report();
      });
    });
  })();
}
