import { computed, effect, html, inject, signal, untracked, viewChild } from "@gable/core";
import { UiBadge } from "../components/ui/badge.js";
import { UiResizableHandle, UiResizablePanel, UiResizablePanelGroup } from "../components/ui/resizable.js";
import { UiTab, UiTabs } from "../components/ui/tabs.js";
import { UiToggleGroup, type ToggleGroupItem } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { DesignerState } from "./designer-state.js";
import { EditPanel } from "./edit-panel.js";
import { FrameBoard } from "./frame-board.js";
import { ComponentTree, HmrTimeline, InjectorTree, Inspector, Problems, ScenesPanel } from "./panels.js";

/** The Designer window: a toolbar, the panels on the left and right, and the canvas in the middle. */
export class Shell {
  static meta = {
    selector: "app-root",
    imports: [FrameBoard, ComponentTree, InjectorTree, ScenesPanel, Inspector, EditPanel, Problems, HmrTimeline, UiTabs, UiTab, UiToggleGroup, UiBadge, UiTooltip, UiResizablePanelGroup, UiResizablePanel, UiResizableHandle],
    template: html`
      <div class="grid h-screen grid-rows-[auto_1fr] bg-background text-foreground">
        <header class="flex items-center gap-3 border-b px-3 py-2">
          <strong class="text-sm">Gable Designer</strong>
          <span class="text-sm text-muted-foreground">{{ projectName() }}</span>
          <ui-toggle-group [items]="modes" [(value)]="modeValue" type="single" variant="outline" size="sm"></ui-toggle-group>
          <span uiBadge variant="outline" uiTooltip="Connection to the preview agent">{{ state.connection() }}</span>
          <span class="text-sm text-muted-foreground">{{ sceneTitle() }}</span>
        </header>
        <ui-resizable-panel-group class="min-h-0" autoSaveId="designer-panels" label="Designer panels">
          <ui-resizable-panel class="min-h-0 overflow-auto p-2" [defaultSize]="20" [minSize]="12" [maxSize]="40">
            <ui-tabs [(value)]="left">
              <ui-tab value="components" label="Components"><app-component-tree></app-component-tree></ui-tab>
              <ui-tab value="injectors" label="Injectors"><app-injector-tree></app-injector-tree></ui-tab>
              <ui-tab value="scenes" label="Scenes"><app-scenes-panel></app-scenes-panel></ui-tab>
            </ui-tabs>
          </ui-resizable-panel>
          <ui-resizable-handle [withHandle]="true"></ui-resizable-handle>
          <ui-resizable-panel class="min-h-0 min-w-0" [minSize]="25"><app-frame-board></app-frame-board></ui-resizable-panel>
          <ui-resizable-handle [withHandle]="true"></ui-resizable-handle>
          <ui-resizable-panel class="min-h-0 overflow-auto p-2" [defaultSize]="26" [minSize]="15" [maxSize]="45">
            <ui-tabs [(value)]="right">
              <ui-tab value="inspector" label="Inspector"><app-inspector></app-inspector></ui-tab>
              <ui-tab value="edit" label="Edit"><app-edit-panel></app-edit-panel></ui-tab>
              <ui-tab value="problems" label="Problems"><app-problems></app-problems></ui-tab>
              <ui-tab value="hmr" label="HMR"><app-hmr-timeline></app-hmr-timeline></ui-tab>
            </ui-tabs>
          </ui-resizable-panel>
        </ui-resizable-panel-group>
      </div>
    `,
  };
  state = inject(DesignerState);
  left = signal("components");
  right = signal("inspector");
  modes: ToggleGroupItem[] = [
    { value: "select", label: "Select" },
    { value: "interact", label: "Interact" },
  ];
  modeValue = signal<string[]>(["select"]);
  syncMode = effect(() => {
    const next = this.modeValue()[0];
    // A single toggle group can be emptied by clicking the pressed item: keep one mode pressed.
    if (!next) return void untracked(() => this.modeValue.set([this.state.mode()]));
    if (next === "select" || next === "interact") untracked(() => void this.state.setMode(next));
  });
  projectName = computed(() => this.state.project()?.name ?? "");
  sceneTitle = computed(() => {
    const info = this.state.sceneInfo();
    return info ? `${info.component} / ${this.state.scene() ?? ""}` : "";
  });
}
