import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { UiButton } from "../components/ui/button.js";
import { UiResizableHandle, UiResizablePanel, UiResizablePanelGroup } from "../components/ui/resizable.js";
import { UiTab, UiTabs } from "../components/ui/tabs.js";
import { ToastService, UiToaster } from "../components/ui/toast.js";
import { UiToggleGroup, type ToggleGroupItem } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiIcon } from "../lib/ui/icon.js";
import { ChromeState } from "./chrome-state.js";
import { CommandPalette } from "./commands.js";
import { ControlChannel } from "./control-channel.js";
import { DesignerState } from "./designer-state.js";
import { Dialogs } from "./dialogs.js";
import { DrawerBody, DrawerTabs } from "./drawer.js";
import { EditPanel } from "./edit-panel.js";
import { EditState } from "./edit-state.js";
import { TailwindPanel } from "./tailwind-panel.js";
import { TailwindState } from "./tailwind-state.js";
import { TokensPanel } from "./tokens-panel.js";
import { DeviceBar, FrameBoard } from "./frame-board.js";
import { RoutesPanel } from "./page-mode.js";
import { InsertPanel, Inspector, StructurePanel } from "./panels.js";

/** The top bar: project, mode, canvas mode, connection, undo/redo, and the command palette's button. */
export class TopBar {
  static meta = {
    selector: "app-top-bar",
    imports: [UiButton, UiIcon, UiToggleGroup, UiTooltip],
    template: html`
      <header class="bar">
        <span class="logo" aria-hidden="true">G</span>
        <strong class="sr-only">Gable Designer</strong>
        <button uiButton variant="ghost" size="sm" class="btn" uiTooltip="Open a project" (click)="chrome.dialog.set('open-project')">{{ projectName() }}<svg uiIcon="chevron-down" class="ico-sm dim"></svg></button>
        @if (modified(); as text) {
          <span class="chip" uiTooltip="Edits made here and not undone">{{ text }}</span>
        }
        <span class="spacer"></span>
        <ui-toggle-group class="seg" [items]="targets" [(value)]="targetValue" type="single" variant="outline" size="sm" data-part="target-mode"></ui-toggle-group>
        <span class="vsep"></span>
        <ui-toggle-group class="seg" [items]="modes" [(value)]="modeValue" type="single" variant="outline" size="sm" data-part="canvas-mode"></ui-toggle-group>
        <span class="spacer"></span>
        <button class="chip" [class.ok]="connected()" [class.warn]="connecting()" [class.err]="failed()" uiTooltip="Connection to the preview agent. Click for details." (click)="chrome.dialog.set('connect')" data-part="connection">
          <span class="dot" [class.ok]="connected()" [class.warn]="connecting()" [class.err]="failed()"></span>
          {{ connectionText() }}
        </button>
        <span class="mono dim" data-part="host">{{ host() }}</span>
        <span class="vsep"></span>
        <button uiButton variant="ghost" size="icon" class="btn icon" uiTooltip="Undo (Ctrl Z)" aria-label="Undo" [disabled]="!edit.canUndo()" (click)="edit.undo()"><svg uiIcon="undo" class="ico"></svg></button>
        <button uiButton variant="ghost" size="icon" class="btn icon" uiTooltip="Redo (Ctrl Y)" aria-label="Redo" [disabled]="!edit.canRedo()" (click)="edit.redo()"><svg uiIcon="redo" class="ico"></svg></button>
        <button uiButton variant="ghost" size="icon" class="btn icon" uiTooltip="Open the page in the system browser, against the same dev server" aria-label="Open in browser" (click)="openInBrowser()"><svg uiIcon="external-link" class="ico"></svg></button>
        <button uiButton variant="ghost" size="icon" class="btn icon" uiTooltip="Light or dark" aria-label="Toggle the theme" (click)="chrome.toggleTheme()"><svg [uiIcon]="themeIcon()" class="ico"></svg></button>
        <button class="fld ghost none palette-btn" (click)="chrome.paletteOpen.set(true)">
          <svg uiIcon="search" class="ico-sm dim"></svg>
          <span class="dim">Search or run command</span>
          <span class="spacer"></span>
          <span class="kbd">Ctrl K</span>
        </button>
      </header>
    `,
  };
  state = inject(DesignerState);
  chrome = inject(ChromeState);
  edit = inject(EditState);
  /** Lets an agent drive this window over MCP (TASK-56.13). */
  control = inject(ControlChannel);

  targets: ToggleGroupItem[] = [
    { value: "component", label: "Component" },
    { value: "page", label: "Page" },
  ];
  targetValue = signal<string[]>(["component"]);
  followTarget = effect(() => {
    const kind = this.state.target().kind;
    untracked(() => this.targetValue.set([kind]));
  });
  chooseTarget = effect(() => {
    const next = this.targetValue()[0];
    untracked(() => {
      const kind = this.state.target().kind;
      // A single toggle group can be emptied by clicking the pressed item: keep one pressed.
      if (!next) return this.targetValue.set([kind]);
      if (next === kind) return;
      if (next === "page") return this.state.showPage();
      const first = this.state.sceneFiles()[0];
      if (first) this.state.showComponent(first);
      else this.targetValue.set([kind]);
    });
  });

  modes: ToggleGroupItem[] = [
    { value: "select", label: "Select" },
    { value: "interact", label: "Interact" },
  ];
  modeValue = signal<string[]>(["select"]);
  syncMode = effect(() => {
    const next = this.modeValue()[0];
    if (!next) return void untracked(() => this.modeValue.set([this.state.mode()]));
    if (next === "select" || next === "interact") untracked(() => void this.state.setMode(next));
  });
  followMode = effect(() => {
    const mode = this.state.mode();
    untracked(() => {
      if (this.modeValue()[0] !== mode) this.modeValue.set([mode]);
    });
  });

  projectName = computed(() => this.state.project()?.name ?? "No project");
  modified = computed(() => {
    const files = new Set(this.edit.history().undo.map((u) => u.file));
    return files.size ? `${files.size} file${files.size === 1 ? "" : "s"} modified` : "";
  });
  connected = computed(() => this.state.connection() === "ready");
  failed = computed(() => !!this.state.error() || !!this.state.project()?.error || this.state.connection() === "incompatible");
  connecting = computed(() => !this.connected() && !this.failed());
  connectionText = computed(() => (this.failed() ? "Disconnected" : this.connected() ? "Connected" : "Connecting"));
  host = computed(() => {
    const url = this.state.project()?.previewUrl;
    if (!url) return "";
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  });
  themeIcon = computed(() => (this.chrome.dark() ? "sun" : "moon"));
  openInBrowser(): void {
    void this.state.frames.openInBrowser().catch(() => undefined);
  }
}

/** The Designer window: a top bar, panels on the left and right, and the canvas over the drawer in the middle. */
export class Shell {
  static meta = {
    selector: "app-root",
    imports: [TopBar, DeviceBar, FrameBoard, DrawerBody, DrawerTabs, StructurePanel, InsertPanel, RoutesPanel, Inspector, EditPanel, TailwindPanel, TokensPanel, CommandPalette, Dialogs, UiToaster, UiTabs, UiTab, UiResizablePanelGroup, UiResizablePanel, UiResizableHandle],
    template: html`
      <div class="grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <app-top-bar></app-top-bar>
        <ui-resizable-panel-group class="min-h-0" label="Designer panels" [keyboardStep]="2" [(layout)]="chrome.panels">
          <ui-resizable-panel class="min-h-0" [defaultSize]="19" [minSize]="12" [maxSize]="40">
            <div class="side">
              <ui-tabs class="ptabs" [(value)]="chrome.left">
                @if (isPage()) {
                  <ui-tab value="routes" label="Routes"><app-routes-panel></app-routes-panel></ui-tab>
                }
                <ui-tab value="structure" label="Structure"><app-structure-panel></app-structure-panel></ui-tab>
                <ui-tab value="insert" label="Insert"><app-insert-panel></app-insert-panel></ui-tab>
              </ui-tabs>
            </div>
          </ui-resizable-panel>
          <ui-resizable-handle></ui-resizable-handle>
          <ui-resizable-panel class="flex min-h-0 min-w-0 flex-col" [minSize]="25">
            <app-device-bar></app-device-bar>
            <ui-resizable-panel-group class="min-h-0 flex-1" direction="vertical" label="Canvas and drawer" [keyboardStep]="2" [(layout)]="chrome.column">
              <ui-resizable-panel class="min-h-0" [defaultSize]="100" [minSize]="20"><app-frame-board></app-frame-board></ui-resizable-panel>
              <ui-resizable-handle [disabled]="closed()"></ui-resizable-handle>
              <ui-resizable-panel class="min-h-0" [defaultSize]="0" [minSize]="0">
                @if (!closed()) {
                  <app-drawer-body></app-drawer-body>
                }
              </ui-resizable-panel>
            </ui-resizable-panel-group>
            @if (closed()) {
              <app-drawer-tabs></app-drawer-tabs>
            }
          </ui-resizable-panel>
          <ui-resizable-handle></ui-resizable-handle>
          <ui-resizable-panel class="min-h-0" [defaultSize]="24" [minSize]="15" [maxSize]="45">
            <div class="side">
              <ui-tabs class="ptabs" [(value)]="chrome.right">
                <ui-tab value="style" label="Style"><app-tailwind-panel></app-tailwind-panel></ui-tab>
                <ui-tab value="tokens" label="Tokens"><app-tokens-panel></app-tokens-panel></ui-tab>
                <ui-tab value="content" label="Content"><app-edit-panel></app-edit-panel></ui-tab>
                <ui-tab value="inspector" label="Inspector"><app-inspector></app-inspector></ui-tab>
              </ui-tabs>
            </div>
          </ui-resizable-panel>
        </ui-resizable-panel-group>
      </div>
      <app-dialogs></app-dialogs>
      <app-command-palette></app-command-palette>
      <ui-toaster position="bottom-right" [limit]="3"></ui-toaster>
    `,
  };
  state = inject(DesignerState);
  chrome = inject(ChromeState);
  edit = inject(EditState);
  toast = inject(ToastService);
  /** Created here so the project's breakpoints reach the frames even before the Style tab is opened. */
  tailwind = inject(TailwindState);

  isPage = computed(() => this.state.target().kind === "page");
  closed = computed(() => !this.chrome.drawerOpen());

  /** The left tab that only exists in page mode is the first thing shown there, and not left selected after it. */
  followTarget = effect(() => {
    const page = this.isPage();
    untracked(() => {
      if (page) this.chrome.left.set("routes");
      else if (this.chrome.left() === "routes") this.chrome.left.set("structure");
    });
  });

  #wire = (() => {
    this.edit.onShowPatch = () => this.chrome.showDrawer("code");
  })();

  /** Problems opens when a diagnostic badge on the canvas is clicked. */
  openProblems = effect(() => {
    if (this.state.badgeClicks() > 0) untracked(() => this.chrome.showDrawer("problems"));
  });

  /** The selection's floating toolbar: the same edits the Content tab makes. */
  performAction = effect(() => {
    const a = this.state.canvasAction();
    if (!a) return;
    untracked(() => {
      const node = this.edit.node();
      if (a.action === "parent") {
        const parent = this.state.picked()?.chain[1];
        if (parent) void this.state.preview.call("selectNode", { id: parent.id }).catch(() => undefined);
      } else if (a.action === "delete") void this.edit.edit((target) => ({ op: "delete", target }));
      else if (a.action === "move-up" && node?.prev) {
        const prev = node.prev;
        void this.edit.edit((target) => ({ op: "move", target, to: { ...target, start: prev.start, tag: prev.tag }, where: "before" }));
      } else if (a.action === "move-down" && node?.next) {
        const next = node.next;
        void this.edit.edit((target) => ({ op: "move", target, to: { ...target, start: next.start, tag: next.tag }, where: "after" }));
      }
    });
  });

  /** A file changed outside the Designer: said once per file set, with the way out. */
  #lastExternal = "";
  announceExternal = effect(() => {
    const files = this.edit.external().join(", ");
    untracked(() => {
      if (files && files !== this.#lastExternal) this.toast.info("File changed on disk", { description: `${files}. Undo still works where it can find its place.`, action: { label: "Show", onClick: () => this.chrome.showDrawer("code") } });
      this.#lastExternal = files;
    });
  });

  /** Window-wide keys. Ctrl K works anywhere; undo and redo leave text fields their own. */
  #keys = (() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        this.chrome.paletteOpen.set(true);
        return;
      }
      this.edit.onKey(e);
    };
    addEventListener("keydown", onKey);
    currentScope()?.onDispose(() => removeEventListener("keydown", onKey));
  })();
}
