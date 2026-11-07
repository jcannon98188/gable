import { computed, contentChildren, effect, html, injectHost, input, model, signal, untracked } from "@gable/core";
import { ResizeEngine, bindProps, type ResizePanelConfig } from "@gable/ui-primitives";
import { UiIcon } from "../lib/icon.js";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

let counter = 0;
const num = (value: unknown, fallback?: number) => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};

/** What a handle needs from its group (projected content cannot inject the group, so the group hands itself over). */
export interface ResizableOwner {
  engine: ResizeEngine;
  direction(): "horizontal" | "vertical";
  /** Starts a pointer drag of handle `index` at pointer position `pos`. */
  begin(index: number, pos: number): void;
  panelId(index: number): string | undefined;
}

/**
 * One panel of `<ui-resizable-panel-group>`. Sizes are percentages of the group.
 *
 *   <ui-resizable-panel [defaultSize]="25" [minSize]="15" [collapsible]="true">Sidebar</ui-resizable-panel>
 *
 * The group hands the panel its size and collapsed state (the owner push); the panel's own size is the CSS `flex` share.
 */
export class UiResizablePanel {
  static meta = { selector: "ui-resizable-panel" };
  /** Starting size in percent; panels without one share what the others leave. */
  defaultSize = input<number | undefined>(undefined);
  minSize = input<number>(0);
  maxSize = input<number>(100);
  /** Dragging past the minimum collapses the panel, and Enter on an adjacent handle toggles it. */
  collapsible = input<boolean>(false);
  /** Size in percent while collapsed. */
  collapsedSize = input<number>(0);
  class = input<string>("");
  /** An id for the panel (the handle's `aria-controls` points at it); generated when not set. */
  id = input<string>("");

  /** Set by the group. */
  size = signal(0);
  collapsed = signal(false);
  private generated = `ui-resizable-panel-${++counter}`;
  panelId = computed(() => this.id() || this.generated);
  config = computed<ResizePanelConfig>(() => ({
    defaultSize: num(this.defaultSize()),
    minSize: num(this.minSize(), 0),
    maxSize: num(this.maxSize(), 100),
    collapsible: !!this.collapsible(),
    collapsedSize: num(this.collapsedSize(), 0),
  }));
  private classes = useHostClass(() => cn("block min-h-0 min-w-0 overflow-hidden", this.class()));
  private attrs = bindProps(() => ({
    id: this.panelId(),
    "data-panel": "",
    "data-state": this.collapsed() ? "collapsed" : "expanded",
    style: `flex: ${this.size()} 1 0px`,
  }));
}

/**
 * The separator between two panels: a WAI-ARIA window splitter (`role="separator"`, `aria-valuenow/min/max` of the panel
 * before it, `aria-controls`). Drag it, or focus it and use the arrow keys along the group's axis, Home, End, and Enter to
 * collapse or expand a collapsible neighbour.
 *
 *   <ui-resizable-handle [withHandle]="true" label="Resize sidebar"></ui-resizable-handle>
 */
export class UiResizableHandle {
  static meta = {
    selector: "ui-resizable-handle",
    imports: [UiIcon],
    template: html`
      @if (withHandle()) {
        <div class="z-10 flex h-6 w-1 shrink-0 items-center justify-center rounded-lg border bg-border group-data-[direction=vertical]/resizable:h-1 group-data-[direction=vertical]/resizable:w-6">
          <svg uiIcon="grip-vertical" class="size-2.5 group-data-[direction=vertical]/resizable:rotate-90"></svg>
        </div>
      }
    `,
  };
  /** Shows a grip. */
  withHandle = input<boolean>(false);
  disabled = input<boolean>(false);
  /** The accessible name. */
  label = input<string>("Resize");
  class = input<string>("");

  /** Set by the group. */
  owner = signal<ResizableOwner | null>(null);
  index = signal(-1);
  private vertical = computed(() => this.owner()?.direction() === "vertical");
  private classes = useHostClass(() =>
    cn(
      "relative flex w-px shrink-0 touch-none items-center justify-center bg-border outline-hidden select-none",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
      "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      "data-[direction=horizontal]:cursor-col-resize data-[direction=vertical]:h-px data-[direction=vertical]:w-full data-[direction=vertical]:cursor-row-resize",
      "data-[direction=vertical]:after:inset-x-0 data-[direction=vertical]:after:inset-y-auto data-[direction=vertical]:after:left-0 data-[direction=vertical]:after:h-1 data-[direction=vertical]:after:w-full data-[direction=vertical]:after:translate-x-0 data-[direction=vertical]:after:-translate-y-1/2",
      "data-[dragging]:bg-ring aria-disabled:cursor-default aria-disabled:opacity-50",
      this.class(),
    ),
  );
  private attrs = bindProps(() => {
    const owner = this.owner();
    const index = this.index();
    if (!owner || index < 0) return null;
    const state = owner.engine.handleState(index);
    const disabled = this.disabled();
    const axis = (event: { clientX: number; clientY: number }) => (owner.direction() === "horizontal" ? event.clientX : event.clientY);
    return {
      role: "separator",
      tabindex: disabled ? undefined : 0,
      "aria-orientation": owner.direction() === "horizontal" ? "vertical" : "horizontal",
      "aria-valuenow": state.now,
      "aria-valuemin": state.min,
      "aria-valuemax": state.max,
      "aria-controls": owner.panelId(index),
      "aria-label": this.label(),
      "aria-disabled": disabled ? "true" : undefined,
      "data-direction": owner.direction(),
      "data-dragging": owner.engine.dragging() ? "" : undefined,
      onpointerdown: (event: PointerEvent) => {
        if (disabled || event.button > 0) return;
        event.preventDefault();
        (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
        owner.begin(index, axis(event));
      },
      onpointermove: (event: PointerEvent) => {
        if (owner.engine.dragging()) owner.engine.dragTo(axis(event));
      },
      onpointerup: (event: PointerEvent) => {
        (event.currentTarget as Element | null)?.releasePointerCapture?.(event.pointerId);
        owner.engine.endDrag();
      },
      onpointercancel: () => owner.engine.endDrag(),
      onkeydown: (event: KeyboardEvent) => {
        if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
        if (owner.engine.key(index, event.key)) event.preventDefault();
      },
    };
  });
}

/**
 * A group of resizable panels with draggable, keyboard-operable handles between them.
 *
 *   <ui-resizable-panel-group direction="horizontal" autoSaveId="editor" class="h-80 rounded-lg border">
 *     <ui-resizable-panel [defaultSize]="30" [minSize]="15" [collapsible]="true">Sidebar</ui-resizable-panel>
 *     <ui-resizable-handle [withHandle]="true"></ui-resizable-handle>
 *     <ui-resizable-panel>Content</ui-resizable-panel>
 *   </ui-resizable-panel-group>
 *
 * Panel sizes are percentages that always total 100; a handle moves the two panels beside it within their
 * `minSize`/`maxSize`. The group needs a size along its axis (`h-80`, or a flex or grid parent that gives it one).
 *
 * Persisting the layout: `[(layout)]` is the sizes as a list of percentages (empty until set; a list that does not fit the
 * panels is ignored), so an app can keep it wherever it likes. `autoSaveId` additionally saves it in localStorage under
 * that name and restores it on the next visit (guarded: storage that is unavailable or full is skipped). A layout bound
 * through `layout` wins over a saved one.
 *
 * Panels and handles are matched by order of creation: put a handle between each pair of panels. Panels added later by
 * `@if` or `@for` are appended in the order they are created, so keep a group's panels static or re-render the group.
 * Nested groups work: each group manages the panels written directly in it.
 */
export class UiResizablePanelGroup {
  static meta = { selector: "ui-resizable-panel-group", template: html`<slot></slot>` };
  direction = input<"horizontal" | "vertical">("horizontal");
  /** Saves the layout in localStorage under this name. */
  autoSaveId = input<string>("");
  /** Percentage of the group one arrow key press moves a handle. */
  keyboardStep = input<number>(10);
  /** An accessible name for the group, optional. */
  label = input<string>("");
  /** Two-way: the panel sizes in percent. */
  layout = model<number[]>([]);
  class = input<string>("");

  panels = contentChildren(UiResizablePanel);
  handles = contentChildren(UiResizableHandle);
  engine = new ResizeEngine({ direction: () => this.direction(), keyboardStep: () => num(this.keyboardStep(), 10)! });
  private host = injectHost().host as { getBoundingClientRect?: () => { width: number; height: number } };

  private classes = useHostClass(() => cn("group/resizable flex h-full w-full data-[direction=vertical]:flex-col", this.class()));
  private attrs = bindProps(() => ({ role: "group", "aria-label": this.label() || undefined, "data-direction": this.direction() }));

  private storageKey = () => (this.autoSaveId() ? `gable-ui:resizable:${this.autoSaveId()}` : "");
  private load(count: number): number[] | null {
    const key = this.storageKey();
    if (!key) return null;
    try {
      const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(key) ?? "null");
      return Array.isArray(parsed) && ResizeEngine.valid(parsed as number[], count) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  private save(sizes: number[]) {
    const key = this.storageKey();
    if (!key) return;
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(sizes));
    } catch {
      // Storage is unavailable or full: the layout simply is not remembered.
    }
  }

  panelId = (index: number) => this.panels()[index]?.panelId();
  begin = (index: number, pos: number) => {
    const rect = this.host.getBoundingClientRect?.();
    const px = rect ? (this.direction() === "horizontal" ? rect.width : rect.height) : 0;
    this.engine.startDrag(index, pos, px);
  };
  /** Collapses panel `index` (a collapsible one). */
  collapse(index: number) {
    this.engine.collapse(index);
  }
  /** Expands a collapsed panel to the size it had, or its minimum. */
  expand(index: number) {
    this.engine.expand(index);
  }

  // Panels changed (or their limits did): lay out from the bound layout, then a saved one, then the defaults.
  private configure = effect(() => {
    const configs = this.panels().map((p) => p.config());
    untracked(() => {
      const bound = this.layout();
      const start = bound.length === configs.length && ResizeEngine.valid(bound, configs.length) ? bound : this.load(configs.length);
      this.engine.configure(configs, start);
    });
  });
  // A layout bound from outside moves the panels.
  private fromModel = effect(() => {
    const bound = this.layout();
    untracked(() => {
      if (bound.length > 0) this.engine.setSizes(bound);
    });
  });
  // The panels moved: tell the model and storage, and push each panel its size.
  private toModel = effect(() => {
    const sizes = this.engine.sizes();
    const panels = this.panels();
    untracked(() => {
      if (sizes.length > 0 && !(sizes.length === this.layout().length && sizes.every((n, i) => n === this.layout()[i]))) {
        this.layout.set([...sizes]);
        this.save(sizes);
      }
    });
    panels.forEach((p, i) => {
      p.size.set(sizes[i] ?? 0);
      p.collapsed.set(this.engine.isCollapsed(i));
    });
  });
  private link = effect(() => {
    this.panels();
    this.handles().forEach((h, i) => {
      h.owner.set(this);
      h.index.set(i);
    });
  });
}
