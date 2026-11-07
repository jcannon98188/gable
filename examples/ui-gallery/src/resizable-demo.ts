import { computed, html, signal } from '@gable/core';
import { UiResizableHandle, UiResizablePanel, UiResizablePanelGroup } from '@gable/ui';

/** Resizable panels: a two-pane split with a grip, a nested vertical split, a collapsible sidebar with a saved layout. */
export class ResizableDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiResizablePanelGroup, UiResizablePanel, UiResizableHandle],
    template: html`
      <main class="mx-auto flex max-w-3xl flex-col gap-10 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Resizable</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Horizontal with a nested vertical split</h2>
          <p class="text-sm text-muted-foreground">Drag a handle, or focus it and use the arrow keys, Home and End.</p>
          <ui-resizable-panel-group direction="horizontal" label="Editor" class="h-64 rounded-lg border" [(layout)]="layout">
            <ui-resizable-panel [defaultSize]="50" [minSize]="20">
              <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">One</span></div>
            </ui-resizable-panel>
            <ui-resizable-handle [withHandle]="true" label="Resize panels"></ui-resizable-handle>
            <ui-resizable-panel [defaultSize]="50" [minSize]="20">
              <ui-resizable-panel-group direction="vertical" label="Details">
                <ui-resizable-panel [defaultSize]="25">
                  <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Two</span></div>
                </ui-resizable-panel>
                <ui-resizable-handle [withHandle]="true" label="Resize rows"></ui-resizable-handle>
                <ui-resizable-panel [defaultSize]="75">
                  <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Three</span></div>
                </ui-resizable-panel>
              </ui-resizable-panel-group>
            </ui-resizable-panel>
          </ui-resizable-panel-group>
          <p class="text-sm text-muted-foreground" id="layout">{{ layoutText() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Collapsible sidebar, layout remembered</h2>
          <p class="text-sm text-muted-foreground">Drag the sidebar below its minimum or press Enter on the handle to collapse it. The layout is saved under <code>autoSaveId</code>; reload to see it restored.</p>
          <ui-resizable-panel-group direction="horizontal" autoSaveId="gallery-sidebar" label="Workspace" class="h-48 rounded-lg border">
            <ui-resizable-panel [defaultSize]="30" [minSize]="15" [maxSize]="45" [collapsible]="true">
              <div class="p-4 text-sm">Sidebar</div>
            </ui-resizable-panel>
            <ui-resizable-handle label="Resize sidebar"></ui-resizable-handle>
            <ui-resizable-panel>
              <div class="p-4 text-sm">Content</div>
            </ui-resizable-panel>
          </ui-resizable-panel-group>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Right to left</h2>
          <p class="text-sm text-muted-foreground">In an RTL group the first panel sits on the right, and dragging or pressing the arrow keys follows the reading direction.</p>
          <ui-resizable-panel-group direction="horizontal" dir="rtl" label="RTL workspace" class="h-40 rounded-lg border" [(layout)]="rtlLayout">
            <ui-resizable-panel [defaultSize]="30" [minSize]="15">
              <div class="p-4 text-sm">First (right)</div>
            </ui-resizable-panel>
            <ui-resizable-handle [withHandle]="true" label="Resize RTL panels"></ui-resizable-handle>
            <ui-resizable-panel [defaultSize]="70" [minSize]="15">
              <div class="p-4 text-sm">Second (left)</div>
            </ui-resizable-panel>
          </ui-resizable-panel-group>
          <p class="text-sm text-muted-foreground" id="rtl-layout">{{ rtlText() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Cascading resize</h2>
          <p class="text-sm text-muted-foreground">Drag the first handle past the middle panel's minimum: the middle panel shrinks to its minimum, then the drag carries on into the next panel.</p>
          <ui-resizable-panel-group direction="horizontal" label="Cascade" class="h-32 rounded-lg border" [(layout)]="cascadeLayout">
            <ui-resizable-panel [defaultSize]="34" [minSize]="10">
              <div class="p-4 text-sm">A</div>
            </ui-resizable-panel>
            <ui-resizable-handle label="Resize A and B"></ui-resizable-handle>
            <ui-resizable-panel [defaultSize]="33" [minSize]="20">
              <div class="p-4 text-sm">B (min 20)</div>
            </ui-resizable-panel>
            <ui-resizable-handle label="Resize B and C"></ui-resizable-handle>
            <ui-resizable-panel [defaultSize]="33" [minSize]="10">
              <div class="p-4 text-sm">C</div>
            </ui-resizable-panel>
          </ui-resizable-panel-group>
          <p class="text-sm text-muted-foreground" id="cascade-layout">{{ cascadeText() }}</p>
        </section>
      </main>
    `,
  };
  layout = signal<number[]>([]);
  rtlLayout = signal<number[]>([]);
  cascadeLayout = signal<number[]>([]);
  rtlText = computed(() => `Layout: ${this.rtlLayout().map((n) => Math.round(n)).join(' / ')}`);
  cascadeText = computed(() => `Layout: ${this.cascadeLayout().map((n) => Math.round(n)).join(' / ')}`);
  layoutText = computed(() => `Layout: ${this.layout().map((n) => Math.round(n)).join(' / ')}`);
}
