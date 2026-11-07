// The canvas: a device bar and a board of frames side by side. A frame is an iframe sized in CSS pixels and scaled as a
// whole (fit-to-screen, or a fixed zoom), so a 1920px desktop and a 390px phone can be seen together.
import { computed, effect, html, inject, input, signal, untracked, viewChild } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { unsupported } from "../../../src/devices.js";
import { UiBadge } from "../components/ui/badge.js";
import { UiButton } from "../components/ui/button.js";
import { UiInput } from "../components/ui/input.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { DesignerState } from "./designer-state.js";
import { frameUrl, type Frame } from "./frames.js";

/** One frame: a title row and the scaled iframe. Clicking the title selects it. */
export class FrameView {
  static meta = {
    selector: "app-frame-view",
    host: { class: "block shrink-0" },
    imports: [UiBadge],
    template: html`
      <div class="flex h-7 items-center gap-2 text-xs" [style.width]="boxWidth()">
        <button class="truncate font-medium hover:underline" (click)="select()">{{ title() }}</button>
        <span class="shrink-0 text-muted-foreground">{{ dims() }}</span>
        <span uiBadge variant="outline" class="ml-auto shrink-0">{{ status() }}</span>
      </div>
      <div class="relative overflow-hidden rounded-sm bg-white shadow-sm" [class.ring-2]="selected()" [class.ring-primary]="selected()" [style.width]="boxWidth()" [style.height]="boxHeight()">
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
    return `${width}×${height}${dpr !== 1 ? ` @${dpr}x` : ""} · ${Math.round(this.scale() * 100)}%`;
  });
  status = computed(() => (this.frame().connection() === "ready" ? "live" : this.frame().connection()));

  select(): void {
    this.state.selectFrame(this.frame().id);
  }
}

/** Size, pixel ratio, rotation, presets, emulation and frame management for the selected frame. */
export class DeviceBar {
  static meta = {
    selector: "app-device-bar",
    host: { class: "block border-b" },
    imports: [UiButton, UiInput, UiBadge, UiTooltip],
    template: html`
      <div class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <select class="h-8 rounded-md border border-input bg-background px-2 text-sm" aria-label="Device" (change)="onPreset($event.currentTarget.value)">
          <option value="custom" [selected]="isCustom()">Custom</option>
          @for (p of presetItems(); track p.id) {
            <option [value]="p.id" [selected]="p.selected">{{ p.label }}</option>
          }
        </select>
        <input uiInput type="number" class="h-8 w-20" aria-label="Width" [value]="size().width" (change)="onWidth($event.currentTarget.value)" />
        <span class="text-muted-foreground">×</span>
        <input uiInput type="number" class="h-8 w-20" aria-label="Height" [value]="size().height" (change)="onHeight($event.currentTarget.value)" />
        <label class="flex items-center gap-1 text-muted-foreground">
          DPR
          <input uiInput type="number" aria-label="DPR" step="0.25" min="1" max="5" class="h-8 w-16" [value]="config().dpr" (change)="onDpr($event.currentTarget.value)" />
        </label>
        <button uiButton variant="outline" size="sm" uiTooltip="Rotate" (click)="rotate()">{{ orientation() }}</button>
        <select class="h-8 rounded-md border border-input bg-background px-2 text-sm" aria-label="Zoom" [value]="zoomValue()" (change)="onZoom($event.currentTarget.value)">
          <option value="fit">Fit</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
        </select>
        <span uiBadge variant="secondary" uiTooltip="The breakpoint the selected frame reaches (Tailwind defaults)">{{ breakpoint() }}</span>
        <span class="mx-1 h-5 border-l"></span>
        <button uiButton variant="outline" size="sm" [disabled]="full()" (click)="add()">Add frame</button>
        <button uiButton variant="outline" size="sm" [disabled]="single()" (click)="remove()">Remove frame</button>
        <label class="flex items-center gap-1" uiTooltip="Repeat clicks, typing and scrolling from one frame in the others (Interact mode)">
          <input type="checkbox" [checked]="sync()" (change)="onSync($event.currentTarget.checked)" />
          Sync
        </label>
        <button uiButton variant="outline" size="sm" class="ml-auto" uiTooltip="Open the page in the system browser, against the same dev server" (click)="openInBrowser()">Open in browser</button>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-sm">
        <span class="text-xs font-medium text-muted-foreground">Emulate</span>
        <label class="flex items-center gap-1">
          <input type="checkbox" [checked]="config().emulation.touch" (change)="onTouch($event.currentTarget.checked)" />
          Touch
          @if (touchNote()) {
            <span uiBadge variant="outline" [uiTooltip]="touchNote()">{{ touchLabel() }}</span>
          }
        </label>
        <label class="flex items-center gap-1">
          Color scheme
          <select class="h-7 rounded-md border border-input bg-background px-2 text-sm" [value]="config().emulation.colorScheme" (change)="onScheme($event.currentTarget.value)">
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          @if (mediaNote()) {
            <span uiBadge variant="outline" [uiTooltip]="mediaNote()">unsupported</span>
          }
        </label>
        <label class="flex items-center gap-1">
          <input type="checkbox" [checked]="config().emulation.reducedMotion" (change)="onMotion($event.currentTarget.checked)" />
          Reduced motion
          @if (mediaNote()) {
            <span uiBadge variant="outline" [uiTooltip]="mediaNote()">unsupported</span>
          }
        </label>
        <span class="flex items-center gap-1 text-muted-foreground" [attr.title]="uaTitle()">
          User agent: {{ uaLabel() }}
          @if (uaNote()) {
            <span uiBadge variant="outline" [uiTooltip]="uaNote()">unsupported</span>
          }
        </span>
        @if (failure()) {
          <span uiBadge variant="destructive" [uiTooltip]="failure()">CDP failed</span>
        }
        <span class="ml-auto flex items-center gap-1">
          <input uiInput class="h-7 w-36" placeholder="Preset name" aria-label="Preset name" [value]="presetName()" (input)="presetName.set($event.currentTarget.value)" />
          <button uiButton variant="outline" size="sm" [disabled]="cannotSave()" (click)="savePreset()">Save preset</button>
          @if (savedCurrent()) {
            <button uiButton variant="ghost" size="sm" (click)="deletePreset()">Delete preset</button>
          }
        </span>
      </div>
    `,
  };
  state = inject(DesignerState);
  frames = this.state.frames;
  presetName = signal("");

  frame = computed(() => this.frames.selected());
  config = computed(() => this.frame().config());
  size = computed(() => this.frame().size());
  orientation = computed(() => (this.config().landscape ? "Landscape" : "Portrait"));
  breakpoint = computed(() => `${this.frames.selectedWidth()}px · ${this.frames.selectedBreakpoint()}`);
  presetItems = computed(() => this.frames.presets().map((p) => ({ id: p.id, label: `${p.name} (${p.width}×${p.height})`, selected: p.id === this.config().presetId })));
  isCustom = computed(() => this.config().presetId === null);
  zoomValue = computed(() => String(this.frames.zoom()));
  sync = computed(() => this.frames.sync());
  full = computed(() => this.frames.frames().length >= 6);
  single = computed(() => this.frames.frames().length <= 1);
  savedCurrent = computed(() => this.frames.saved().some((p) => p.id === this.config().presetId));
  cannotSave = computed(() => this.presetName().trim() === "");

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
  uaTitle = computed(() => this.config().emulation.userAgent ?? "The webview's own user agent");

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
  remove(): void {
    this.frames.remove(this.config().id);
    this.state.selectFrame(this.frames.selected().id);
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
  openInBrowser(): void {
    void this.frames.openInBrowser().catch(() => undefined);
  }
}

/** The preview area: the device bar above a scrollable board of frames. */
export class FrameBoard {
  static meta = {
    selector: "app-frame-board",
    host: { class: "block h-full" },
    imports: [DeviceBar, FrameView],
    template: html`
      <div class="flex h-full flex-col">
        <app-device-bar></app-device-bar>
        <div #board class="relative min-h-0 flex-1 overflow-auto bg-muted/50">
          <div class="flex w-max items-start gap-6 p-4">
            @for (f of frames(); track f.id) {
              <app-frame-view [frame]="f"></app-frame-view>
            }
          </div>
          @if (message()) {
            <div class="absolute inset-0 flex items-center justify-center bg-background/80 p-6 text-center text-sm text-muted-foreground">{{ message() }}</div>
          }
        </div>
      </div>
    `,
  };
  state = inject(DesignerState);
  board = viewChild<HTMLElement>("board");
  frames = computed(() => this.state.frames.frames());
  message = computed(() => {
    const s = this.state;
    if (s.error()) return s.error();
    if (s.incompatible()) return s.incompatible();
    if (!s.project()?.ready) return "Starting the project's dev server…";
    return null;
  });

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
