// The Designer's dialogs. Open project, connect (with installing what the Preview agent needs) and the dev server log run
// against the backend through ProjectState. The flows that have no backend yet (extract component, create Scenario) are built
// with what is real filled in and the unavailable part said plainly; nothing here pretends to have done anything.
// The route dialog lives with the route tree (page-mode.ts) and the binding picker with the Content tab (edit-panel.ts).
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiDialog } from "../components/ui/dialog.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiIcon } from "../lib/ui/icon.js";
import { ChromeState, type DialogName } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import { ProjectState } from "./project-state.js";
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
      <ui-dialog [(open)]="openProject" heading="Open a project" description="Pick a folder with a Gable app. The Designer starts its Vite and connects." contentClass="dlg">
        <label class="form-row"><span>Folder</span>
          <input class="fld mono" data-part="project-path" spellcheck="false" placeholder="Full path to the project folder" [value]="projects.path()" (input)="projects.path.set($event.currentTarget.value)" (keydown)="onPathKey($event.key)" />
        </label>
        @if (projects.openError(); as why) {
          <p class="callout err" role="alert" data-part="open-error">{{ why }}</p>
        }
        <div class="dim">Recent</div>
        <div class="pick-list" data-part="recent">
          @for (p of projects.recent(); track p.root) {
            <button class="mi" [class.on]="p.root === root()" [disabled]="p.missing" [attr.title]="p.root" (click)="openRecent(p.root)">
              <svg uiIcon="folder-open" class="ico-sm dim"></svg><span class="truncate">{{ p.name }}</span><span class="spacer"></span>@if (p.missing) {
                <span class="mono dim">missing</span>
              } @else {
                <span class="mono dim truncate">{{ p.root }}</span>
              }
            </button>
          }
          @if (!projects.recent().length) {
            <span class="dim">No recent projects yet.</span>
          }
        </div>
        <div class="dim">Browse</div>
        <div class="flex items-center gap-2">
          <button uiButton variant="ghost" size="icon" class="btn icon" aria-label="Up one folder" uiTooltip="Up one folder" [disabled]="!folders()?.parent" (click)="up()"><svg uiIcon="arrow-up" class="ico-sm"></svg></button>
          <span class="mono truncate dim" data-part="browse-dir">{{ folders()?.dir ?? "" }}</span>
        </div>
        <div class="pick-list" data-part="folders">
          @for (f of folderItems(); track f.path) {
            <button class="mi" [class.on]="f.path === projects.path()" [attr.title]="f.path" (click)="pickFolder(f.path, f.project)" (dblclick)="enter(f.path)">
              <svg uiIcon="folder-open" class="ico-sm dim"></svg><span class="truncate">{{ f.name }}</span><span class="spacer"></span>
              @if (f.project) {
                <span class="chip ok">project</span>
              }
            </button>
          }
          @if (folders()?.error; as why) {
            <span class="dim">{{ why }}</span>
          }
        </div>
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Close</button>
          <button uiButton size="sm" class="btn" data-part="open-project" [disabled]="cannotOpen()" (click)="openPath()">{{ openLabel() }}</button>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="connect" heading="Connect to dev server" description="What this project needs before the Designer can inspect it." contentClass="dlg">
        <div class="wrap" style="margin-bottom: 8px" data-part="checks">
          <span class="chip" [class.ok]="!!check()?.packageJson" [class.err]="!check()?.packageJson">{{ packageText() }}</span>
          <span class="chip" [class.ok]="!!check()?.vite?.found" [class.warn]="!check()?.vite?.found">{{ viteText() }}</span>
          <span class="chip" [class.ok]="!!check()?.agent?.found" [class.warn]="!check()?.agent?.found" data-part="agent-check">{{ agentCheckText() }}</span>
          <span class="chip" [class.ok]="project().server" [class.err]="project().failed" [class.warn]="!project().server && !project().failed">{{ project().serverText }}</span>
          <span class="chip" [class.ok]="agentReady()" [class.warn]="!agentReady()">{{ agentText() }}</span>
          <span class="chip" [class.ok]="tailwindOn()" [class.off]="!tailwindOn()">{{ tailwindText() }}</span>
        </div>
        <div class="form-row"><span>Project</span><span class="mono truncate" [attr.title]="root()">{{ root() }}</span></div>
        <div class="form-row"><span>Preview</span><span class="mono truncate">{{ project().url }}</span></div>
        @if (project().error) {
          <p class="callout err" role="alert">{{ project().error }}</p>
        }
        @if (installCommand()) {
          <p class="callout info" data-part="install-info">{{ installText() }}</p>
        } @else if (check()?.problem) {
          <p class="callout warn">{{ check()?.problem }}</p>
        } @else {
          <p class="callout">The Designer runs the project's own Vite with its plugin added; nothing is written to the project.</p>
        }
        @if (projects.actionError(); as why) {
          <p class="callout err" role="alert">{{ why }}</p>
        }
        @if (projects.installing() || logShown()) {
          <pre class="code msg-code" data-part="install-log">{{ projects.logTail() || "Waiting for output…" }}</pre>
        }
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="ghost" size="sm" class="btn" (click)="chrome.dialog.set('server-log')">Open log</button>
          <button uiButton variant="outline" size="sm" class="btn" [disabled]="projects.restarting() || projects.installing()" (click)="restart()">Restart server</button>
          @if (installCommand()) {
            <button uiButton size="sm" class="btn" data-part="install" [disabled]="projects.installing()" (click)="install()">{{ installLabel() }}</button>
          } @else {
            <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Close</button>
          }
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="serverLog" heading="Dev server log" description="Output of the project's Vite and of installs run from the Designer." contentClass="dlg">
        <div class="wrap" style="margin-bottom: 8px">
          <span class="chip" [class.ok]="project().server" [class.err]="project().failed" [class.warn]="!project().server && !project().failed">{{ project().serverText }}</span>
          <span class="mono dim truncate">{{ project().url }}</span>
        </div>
        <pre class="code msg-code log-text" data-part="server-log">{{ projects.log() || "Nothing logged yet." }}</pre>
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Close</button>
          <button uiButton size="sm" class="btn" data-part="restart" [disabled]="projects.restarting() || projects.installing()" (click)="restart()">Restart server</button>
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
  projects = inject(ProjectState);

  openProject = dialogOpen(this.chrome, "open-project");
  connect = dialogOpen(this.chrome, "connect");
  serverLog = dialogOpen(this.chrome, "server-log");
  extract = dialogOpen(this.chrome, "extract");
  newScenario = dialogOpen(this.chrome, "new-scenario");

  extractName = signal("");
  scenarioName = signal("");

  root = computed(() => this.state.project()?.root ?? "");
  project = computed(() => {
    const p = this.state.project();
    return {
      server: !!p?.ready && !p.error,
      failed: !!p?.error,
      serverText: p?.installing ? "Installing dependencies" : p?.error ? "Dev server failed" : p?.ready ? "Dev server running" : "Dev server starting",
      url: p?.previewUrl ?? "",
      error: p?.error ?? "",
    };
  });
  check = computed(() => this.projects.check());
  installCommand = computed(() => this.check()?.install?.join(" ") ?? "");
  viteText = computed(() => {
    const vite = this.check()?.vite;
    return vite?.found ? `Vite ${vite.version ?? ""}`.trim() : "Vite not found";
  });
  installText = computed(() => {
    const c = this.check();
    if (!c) return "";
    const missing = [!c.agent.found && "@gable/core (the Preview agent's in-app hook, @gable/core/designer)", !c.vite.found && "vite"].filter(Boolean).join(" and ");
    return `The project's dependencies are not installed: ${missing} cannot be found. Install and start runs ${this.installCommand()} in the project, then restarts the dev server. The Designer's half of the agent is injected by its Vite plugin; nothing is added to your source.`;
  });
  /** The log tail shows in the connect dialog once an install has run or while the server is failing. */
  logShown = computed(() => this.project().failed || this.projects.log().includes("\n$ "));
  folders = computed(() => this.projects.folders());
  folderItems = computed(() => this.folders()?.folders ?? []);
  cannotOpen = computed(() => !this.projects.path().trim() || this.projects.opening());
  openLabel = computed(() => (this.projects.opening() ? "Opening…" : "Open"));
  packageText = computed(() => (this.check()?.packageJson ? "package.json found" : "No package.json"));
  agentCheckText = computed(() => (this.check()?.agent.found ? "Preview agent available" : "Preview agent not installed"));
  installLabel = computed(() => (this.projects.installing() ? "Installing…" : "Install and start"));

  /** Opening the dialog loads recent projects and the folders next to the current project. */
  prepare = effect(() => {
    if (this.chrome.dialog() === "open-project") untracked(() => void this.projects.prepareOpen());
  });

  onPathKey(key: string): void {
    if (key === "Enter") void this.projects.open();
  }
  openPath(): void {
    void this.projects.open();
  }
  openRecent(root: string): void {
    this.projects.path.set(root);
    void this.projects.open(root);
  }
  /** A click selects a folder; one that is not a project is also opened in the list, to go further down. */
  pickFolder(path: string, project: boolean): void {
    this.projects.path.set(path);
    if (!project) void this.projects.browse(path);
  }
  enter(path: string): void {
    void this.projects.browse(path);
  }
  up(): void {
    const parent = this.folders()?.parent;
    if (parent) void this.projects.browse(parent);
  }
  install(): void {
    void this.projects.install();
  }
  restart(): void {
    void this.projects.restart();
  }
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
