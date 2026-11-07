// The flows the design calls for that have no backend yet (open project, install the agent, extract component, create Scenario)
// are built here with what is real filled in and the unavailable part said plainly; nothing here pretends to have done anything.
// The route dialog lives with the route tree (page-mode.ts) and the binding picker with the Content tab (edit-panel.ts): those work.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiDialog } from "../components/ui/dialog.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiIcon } from "../lib/ui/icon.js";
import { ChromeState, type DialogName } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import { TailwindState } from "./tailwind-state.js";

/** One two-way `open` signal per dialog, driven by `ChromeState.dialog`. */
function dialogOpen(chrome: ChromeState, name: Exclude<DialogName, null>) {
  const open = signal(false);
  effect(() => {
    const shown = chrome.dialog() === name;
    untracked(() => open.set(shown));
  });
  effect(() => {
    const now = open();
    if (!now && untracked(chrome.dialog) === name) untracked(() => chrome.dialog.set(null));
  });
  return open;
}

export class Dialogs {
  static meta = {
    selector: "app-dialogs",
    imports: [UiButton, UiDialog, UiIcon, UiTooltip],
    template: html`
      <ui-dialog [(open)]="openProject" heading="Open a project" description="The Designer works on a project folder: the source files are the design." contentClass="dlg">
        <div class="form-row"><span>Current</span><span class="mono truncate" [attr.title]="root()">{{ root() }}</span></div>
        <div class="drop" aria-disabled="true">
          <svg uiIcon="folder-open" class="ico" style="margin: 0 auto 6px"></svg>
          Opening another project from here is not available yet.
          <div class="mono dim" style="margin-top: 6px">gable-designer path/to/project</div>
        </div>
        <div slot="footer" class="flex justify-end gap-2">
          <span uiTooltip="Needs a project switcher in the backend" tabindex="0"><button uiButton size="sm" class="btn" disabled>Browse…</button></span>
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Close</button>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="connect" heading="Connect to dev server" description="What the Designer knows about this project's dev server." contentClass="dlg">
        <div class="wrap" style="margin-bottom: 8px">
          <span class="chip" [class.ok]="project().server" [class.err]="!project().server">{{ project().serverText }}</span>
          <span class="chip" [class.ok]="agentReady()" [class.warn]="!agentReady()">{{ agentText() }}</span>
          <span class="chip" [class.ok]="tailwindOn()" [class.off]="!tailwindOn()">{{ tailwindText() }}</span>
        </div>
        <div class="form-row"><span>Preview</span><span class="mono truncate">{{ project().url }}</span></div>
        @if (project().error) {
          <p class="callout err" role="alert">{{ project().error }}</p>
        }
        <p class="callout">The Designer starts the project's Vite itself. Installing the preview agent into a project from here is not available yet.</p>
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Close</button>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="extract" heading="Extract to component" description="Moves the selection into a new component and uses it here." contentClass="dlg">
        <label class="form-row"><span>Name</span>
          <input class="fld mono" placeholder="ProductCard" [value]="extractName()" (input)="extractName.set($event.currentTarget.value)" />
        </label>
        <div class="form-row"><span>Selection</span><span class="mono truncate">{{ selectionText() }}</span></div>
        <p class="callout warn">Extracting is not available yet: the backend has no edit for it, so nothing would be written.</p>
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Cancel</button>
          <span uiTooltip="Needs an extract edit in the backend" tabindex="0"><button uiButton size="sm" class="btn" disabled>Extract</button></span>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="newScenario" heading="New Scenario" description="One way to render a component: its inputs and fake services." contentClass="dlg">
        <label class="form-row"><span>Name</span>
          <input class="fld" placeholder="Empty list" [value]="scenarioName()" (input)="scenarioName.set($event.currentTarget.value)" />
        </label>
        <div class="form-row"><span>Component</span><span class="mono">{{ component() }}</span></div>
        <div class="form-row"><span>Target file</span><span class="mono truncate">{{ scenesFile() }}</span></div>
        <pre class="code card route-preview">{{ snippet() }}</pre>
        <p class="callout warn">The Designer cannot write Scenarios yet. Add this to the scenes file by hand and it appears in the list.</p>
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Cancel</button>
          <span uiTooltip="Needs a Scenario writer in the backend" tabindex="0"><button uiButton size="sm" class="btn" disabled>Create</button></span>
        </div>
      </ui-dialog>
    `,
  };
  chrome = inject(ChromeState);
  state = inject(DesignerState);
  edit = inject(EditState);
  tailwind = inject(TailwindState);

  openProject = dialogOpen(this.chrome, "open-project");
  connect = dialogOpen(this.chrome, "connect");
  extract = dialogOpen(this.chrome, "extract");
  newScenario = dialogOpen(this.chrome, "new-scenario");

  extractName = signal("");
  scenarioName = signal("");

  root = computed(() => this.state.project()?.root ?? "");
  project = computed(() => {
    const p = this.state.project();
    return {
      server: !!p?.ready && !p.error,
      serverText: p?.error ? "Dev server failed" : p?.ready ? "Dev server running" : "Dev server starting",
      url: p?.previewUrl ?? "",
      error: p?.error ?? "",
    };
  });
  agentReady = computed(() => this.state.connection() === "ready");
  agentText = computed(() => (this.agentReady() ? "Agent connected" : `Agent ${this.state.connection()}`));
  tailwindOn = computed(() => !!this.tailwind.enabled());
  tailwindText = computed(() => {
    const on = this.tailwind.enabled();
    return on ? `Tailwind ${on.version}` : "Tailwind off";
  });
  selectionText = computed(() => {
    const n = this.state.picked()?.node;
    return n ? `<${n.tag}>` : "Nothing selected";
  });
  component = computed(() => this.state.sceneInfo()?.component ?? "No component on the canvas");
  scenesFile = computed(() => {
    const target = this.state.target();
    return target.kind === "component" ? target.scenes : "Component mode only";
  });
  snippet = computed(() => {
    const name = this.scenarioName().trim() || "Empty list";
    return `scenes: {\n  ${JSON.stringify(name)}: { description: '', inputs: {} },\n}`;
  });

  close(): void {
    this.chrome.dialog.set(null);
  }
}
