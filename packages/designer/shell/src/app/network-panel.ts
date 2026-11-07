// The drawer's Network panel (it replaces the HTTP panel): the selected frame's API requests as the Preview agent saw them,
// the network condition put on them (slow, error, offline), recording real responses and saving them as a Scenario, and the
// mocks of the Scenario that answers the frame now, editable in place. Everything shown comes from the page or the source.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { conditionLabel, mocksFromRecording, type MockInfo, type NetworkCondition, type NetworkEntry } from "../../../src/network.js";
import { UiButton } from "../components/ui/button.js";
import { UiDialog } from "../components/ui/dialog.js";
import { UiJsonViewer } from "../components/ui/json-viewer.js";
import { UiSelect } from "../components/ui/select.js";
import { UiSwitch } from "../components/ui/switch.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiVirtualTable, type VirtualTableColumn } from "../components/ui/virtual-table.js";
import { DesignerState } from "./designer-state.js";
import { frameUrl } from "./frames.js";
import { NetworkState } from "./network-state.js";
import { PageState } from "./page-state.js";
import { formatBytes, formatMs } from "./perf-state.js";

const LOG_COLUMNS: VirtualTableColumn[] = [
  { key: "status", label: "Status", width: "84px" },
  { key: "method", label: "Method", width: "64px" },
  { key: "path", label: "URL", width: "minmax(0, 2.4fr)" },
  { key: "kind", label: "Kind", width: "52px" },
  { key: "time", label: "Time", width: "70px", align: "right" },
  { key: "size", label: "Size", width: "70px", align: "right" },
  { key: "initiator", label: "Initiator", width: "minmax(0, 1.2fr)" },
  { key: "conditioned", label: "Condition", width: "minmax(0, 1fr)" },
];

const MODE_ITEMS = [
  { value: "normal", label: "Normal" },
  { value: "slow", label: "Slow" },
  { value: "error", label: "Server error" },
  { value: "offline", label: "Offline" },
];

/** A log entry as the table shows it. */
export function logRow(e: NetworkEntry, origin: string): Record<string, string | number> {
  const url = e.url.startsWith(origin + "/") ? e.url.slice(origin.length) : e.url;
  const status = e.kind === "mock" && e.mock === -1 ? "no mock" : e.status === null ? "pending" : e.status === 0 ? (e.error ?? "failed") : String(e.status);
  return {
    id: e.id,
    status,
    method: e.method,
    path: url,
    kind: e.kind,
    time: e.duration === null ? "" : formatMs(e.duration),
    size: e.size === null ? "" : formatBytes(e.size),
    initiator: e.initiator ?? "",
    conditioned: e.conditioned ?? "",
  };
}

export class NetworkPanel {
  static meta = {
    selector: "app-network-panel",
    host: { class: "flex h-full min-h-0 flex-col" },
    imports: [UiButton, UiDialog, UiJsonViewer, UiSelect, UiSwitch, UiTooltip, UiVirtualTable],
    template: html`
      <div class="dbar">
        <span class="dim truncate" data-part="net-summary" [attr.title]="summary()">{{ summary() }}</span>
        <span class="spacer"></span>
        <span class="dim mono" data-part="net-count">{{ counts() }}</span>
        <button uiButton variant="ghost" size="sm" class="btn sm" data-part="net-clear" [disabled]="!ready()" (click)="net.clear()">Clear log</button>
      </div>
      <div class="dbar net-bar" data-part="net-condition-bar">
        <span class="dim">Condition</span>
        <!-- TODO(gable-ui): UiSelect has no aria-label input, so the select is named by the text before it only. -->
        <ui-select triggerClass="fld-select net-mode" data-part="net-mode" [items]="modeItems" [(value)]="modePick"></ui-select>
        @if (modePick() === "slow") {
          <label class="net-field"><span class="dim">+</span><input class="fld net-num" type="number" min="0" max="60000" step="100" aria-label="Delay in milliseconds" data-part="net-delay" [value]="delay()" (change)="setDelay($event.currentTarget.valueAsNumber)" /><span class="dim">ms</span></label>
        }
        @if (modePick() === "error") {
          <label class="net-field"><span class="dim">status</span><input class="fld net-num" type="number" min="400" max="599" aria-label="Error status" data-part="net-status" [value]="status()" (change)="setStatus($event.currentTarget.valueAsNumber)" /></label>
        }
        @if (modePick() !== "normal") {
          <input class="fld net-match" placeholder="Every API request" aria-label="Only requests whose URL contains" data-part="net-match" [value]="match()" (change)="setMatch($event.currentTarget.value)" />
        }
        @if (modePick() === "offline") {
          @if (net.cdp()) {
            <ui-switch data-part="net-frame-offline" [(value)]="framePick">Whole frame</ui-switch>
          } @else {
            <span class="chip off" data-part="net-frame-off" tabindex="0" uiTooltip="Taking the whole frame offline (assets, sockets) goes through CDP, which only the Windows desktop app has. API requests are failed as offline without it.">Whole frame unavailable</span>
          }
        }
        <span class="spacer"></span>
        <span class="chip" [class.warn]="conditioned()" [class.off]="!conditioned()" data-part="net-condition">{{ label() }}</span>
      </div>
      @if (note(); as n) {
        <p class="callout warn" role="status" data-part="net-note">{{ n }}</p>
      }
      @if (net.error(); as e) {
        <p class="callout err" role="alert" data-part="net-error">The frame's network could not be read: {{ e }}</p>
      }
      <div class="split min-h-0 flex-1">
        <div class="flex min-h-0 flex-col">
          @if (rows().length) {
            <ui-virtual-table class="min-h-0 flex-1" data-part="net-log" [columns]="columns" [rows]="rows()" rowKey="id" [rowHeight]="26" label="Requests"></ui-virtual-table>
          } @else {
            <div class="empty" data-part="net-empty"><strong>No requests yet</strong>The page's fetch and XMLHttpRequest calls, and the requests a Scenario's mocks answer, appear here as the app makes them.</div>
          }
        </div>
        <div>
          <div class="sec-h">Record real responses</div>
          <div class="dbar">
            @if (net.recording().on) {
              <button uiButton variant="outline" size="sm" class="btn sm" data-part="net-record" [disabled]="!ready()" (click)="stop()">Stop recording</button>
            } @else {
              <button uiButton variant="outline" size="sm" class="btn sm" data-part="net-record" uiTooltip="Keep the frame's API responses (it survives reloads of the frame)" [disabled]="!ready()" (click)="start()">Record</button>
              <button uiButton variant="ghost" size="sm" class="btn sm" data-part="net-record-reload" uiTooltip="Start over and reload the frame, so its first requests are recorded too" [disabled]="!ready()" (click)="startFromReload()">Record from reload</button>
            }
            <span class="chip" [class.on]="net.recording().on" [class.off]="!net.recording().on" data-part="net-record-count">{{ recordCount() }}</span>
            <span class="spacer"></span>
            <button uiButton variant="ghost" size="sm" class="btn sm" data-part="net-record-clear" [disabled]="!ready() || !net.recording().count" (click)="discard()">Discard</button>
            <button uiButton size="sm" class="btn sm" data-part="net-save" [disabled]="!ready() || !net.recording().count" (click)="openSave()">Save as Scenario…</button>
          </div>
          @if (!net.recording().persisted) {
            <p class="callout warn" role="status">The page's sessionStorage is full or blocked: what was recorded is lost if the frame reloads. Save it first.</p>
          }
          @if (net.saved(); as s) {
            <div class="callout info" role="status" data-part="net-saved">
              {{ savedText() }}
              <button uiButton variant="outline" size="sm" class="btn sm" data-part="net-use-saved" (click)="net.useSaved()">Use it</button>
              @for (l of leftRows(); track l.key) {
                <div class="dim">{{ l.text }}</div>
              }
            </div>
          }
          <div class="sec-h">{{ mocksTitle() }}</div>
          @if (mocksWhy(); as why) {
            <p class="dim net-pad" data-part="net-mocks-why">{{ why }}</p>
          }
          @for (m of mockRows(); track m.key) {
            <div class="tbl-row net-mock" data-part="net-mock" [attr.data-url]="m.url">
              <span class="mono">{{ m.method }}</span>
              <span class="mono truncate" [attr.title]="m.url">{{ m.url }}</span>
              <span class="chip" [class.err]="m.bad" [class.ok]="!m.bad">{{ m.reply }}</span>
              @if (m.readonly) {
                <span class="dim truncate" [attr.title]="m.readonly">{{ m.readonly }}</span>
              } @else {
                <span class="net-actions">
                  <button uiButton variant="ghost" size="sm" class="btn sm" data-part="net-mock-edit" [attr.aria-label]="m.editLabel" (click)="openEdit(m.info)">Edit</button>
                  <button uiButton variant="ghost" size="sm" class="btn sm" data-part="net-mock-remove" [attr.aria-label]="m.removeLabel" (click)="remove(m.info)">Remove</button>
                </span>
              }
            </div>
          }
          @if (mockError(); as e) {
            <p class="callout err" role="alert" data-part="net-mock-error">{{ e }}</p>
          }
        </div>
      </div>

      <ui-dialog [(open)]="saveOpen" heading="Save recording as a Scenario" description="Each recorded request becomes a mock that answers it the same way. The Scenario is written into the scenes file, where Undo takes it back." contentClass="dlg">
        <label class="form-row"><span>Scenes file</span>
          <select class="fld" aria-label="Scenes file" data-part="net-save-file" (change)="saveFile.set($event.currentTarget.value)">
            @for (f of fileOptions(); track f) {
              <option [value]="f" [selected]="f === saveFile()">{{ f }}</option>
            }
          </select>
        </label>
        <label class="form-row"><span>Name</span>
          <input class="fld" placeholder="Recorded" aria-label="Scenario name" data-part="net-save-name" [value]="saveName()" (input)="saveName.set($event.currentTarget.value)" />
        </label>
        <label class="form-row"><span>Description</span>
          <input class="fld" placeholder="Optional" aria-label="Scenario description" data-part="net-save-description" [value]="saveDescription()" (input)="saveDescription.set($event.currentTarget.value)" />
        </label>
        @if (isPage()) {
          <label class="form-row"><span>Opens at</span>
            <input class="fld mono" placeholder="/" aria-label="URL the Scenario opens at" data-part="net-save-url" [value]="saveUrl()" (input)="saveUrl.set($event.currentTarget.value)" />
          </label>
        }
        <p class="dim">{{ savePreview() }}</p>
        @if (!fileOptions().length) {
          <p class="callout warn" role="status">The project has no scenes file yet. Create one with New Scenario on a component first.</p>
        }
        @if (saveError()) {
          <p class="callout err" role="alert" data-part="net-save-error">{{ saveError() }}</p>
        }
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="saveOpen.set(false)">Cancel</button>
          <button uiButton size="sm" class="btn" data-part="net-save-submit" [disabled]="!canSave()" (click)="save()">Save</button>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="editOpen" [heading]="editHeading()" description="Changes the mock in the scenes file; the page picks it up on its next request." contentClass="dlg">
        <label class="form-row"><span>Status</span>
          <input class="fld" type="number" min="100" max="599" aria-label="Status" data-part="net-edit-status" [value]="editStatus()" (input)="editStatus.set($event.currentTarget.value)" />
        </label>
        <label class="form-row"><span>Delay (ms)</span>
          <input class="fld" type="number" min="0" max="60000" aria-label="Delay in milliseconds" data-part="net-edit-delay" [value]="editDelay()" (input)="editDelay.set($event.currentTarget.value)" />
        </label>
        <label class="form-row"><span>Fail as</span>
          <select class="fld" aria-label="Fail as" data-part="net-edit-error" (change)="editFail.set($event.currentTarget.value)">
            @for (o of failOptions; track o.value) {
              <option [value]="o.value" [selected]="o.value === editFail()">{{ o.label }}</option>
            }
          </select>
        </label>
        <label class="form-row net-body-row"><span>Body (JSON)</span>
          <!-- TODO(gable-ui): there is no textarea (or code editor) component; a styled native textarea stands in. -->
          <textarea class="fld mono net-body" rows="8" aria-label="Body as JSON" data-part="net-edit-body" [value]="editBody()" (input)="editBody.set($event.currentTarget.value)"></textarea>
        </label>
        @if (editError()) {
          <p class="callout err" role="alert" data-part="net-edit-error-text">{{ editError() }}</p>
        }
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="editOpen.set(false)">Cancel</button>
          <button uiButton size="sm" class="btn" data-part="net-edit-submit" (click)="saveEdit()">Save</button>
        </div>
      </ui-dialog>
    `,
  };
  net = inject(NetworkState);
  state = inject(DesignerState);
  page = inject(PageState);
  columns = LOG_COLUMNS;
  modeItems = MODE_ITEMS;
  failOptions = [
    { value: "", label: "Answer (no failure)" },
    { value: "network", label: "Network error" },
    { value: "abort", label: "Aborted" },
  ];

  ready = computed(() => this.state.connection() === "ready");
  isPage = computed(() => this.state.target().kind === "page");

  summary = computed(() => {
    const a = this.net.active();
    if (this.state.target().kind === "component") return a ? `Component mode: scene ${a.scene}'s mocks answer its requests.` : "Component mode.";
    return a ? `Scenario ${a.scene}: its mocks answer the app's HTTP calls; anything else goes to the network.` : "No scenario: the app talks to its real backend. Record it, or pick a scenario in the Routes tab.";
  });
  rows = computed(() => {
    const origin = this.#origin();
    return (this.net.snapshot()?.entries ?? []).map((e) => logRow(e, origin));
  });
  #origin = computed(() => {
    try {
      return new URL(frameUrl(this.state.frameUrl() ?? "", this.state.frames.selected().slot)).origin;
    } catch {
      return "";
    }
  });
  counts = computed(() => {
    const s = this.net.snapshot();
    if (!s) return "";
    const failed = s.entries.filter((e) => e.status === 0 || (e.status ?? 0) >= 400 || e.mock === -1).length;
    return `${s.entries.length} request${s.entries.length === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}${s.dropped ? ` (${s.dropped} older dropped)` : ""}`;
  });

  // --- the condition: the controls follow the frame's condition, and a change applies it --------------------------------
  modePick = signal("normal");
  delay = computed(() => this.net.condition().delay);
  status = computed(() => this.net.condition().status);
  match = computed(() => this.net.condition().match);
  framePick = signal(false);
  label = computed(() => conditionLabel(this.net.condition()));
  conditioned = computed(() => this.net.condition().mode !== "normal");
  note = computed(() => this.net.frameNote()[this.state.frames.selectedId()] ?? null);
  follow = effect(() => {
    const { mode, frame } = this.net.condition();
    untracked(() => (this.modePick.set(mode), this.framePick.set(frame)));
  });
  applyMode = effect(() => {
    const mode = this.modePick() as NetworkCondition["mode"];
    untracked(() => {
      if (this.ready() && mode !== this.net.condition().mode) void this.apply({ mode, frame: false });
    });
  });
  applyFrame = effect(() => {
    const frame = this.framePick();
    untracked(() => {
      const c = this.net.condition();
      if (c.mode === "offline" && frame !== c.frame) void this.apply({ frame });
    });
  });

  setDelay(delay: number): Promise<void> {
    return this.apply({ delay });
  }
  setStatus(status: number): Promise<void> {
    return this.apply({ status });
  }
  setMatch(match: string): Promise<void> {
    return this.apply({ match });
  }

  async apply(patch: Partial<NetworkCondition>): Promise<void> {
    if (typeof patch.delay === "number" && Number.isNaN(patch.delay)) return;
    if (typeof patch.status === "number" && Number.isNaN(patch.status)) return;
    await this.net.setCondition(patch).catch(() => undefined);
  }

  // --- recording ---------------------------------------------------------------------------------------------------------
  recordCount = computed(() => {
    const r = this.net.recording();
    const n = `${r.count} response${r.count === 1 ? "" : "s"}`;
    return this.net.reloading() ? `${n} · reloading…` : r.on ? `Recording · ${n}` : n;
  });

  start = () => this.record({ on: true });
  stop = () => this.record({ on: false });
  startFromReload = () => this.record({ on: true, clear: true, reload: true });
  discard = () => this.record({ clear: true });
  savedText = computed(() => {
    const s = this.net.saved();
    return s ? `Saved Scenario "${s.name}" (${s.mocks} mock${s.mocks === 1 ? "" : "s"}) to ${s.file}.` : "";
  });
  leftRows = computed(() => (this.net.saved()?.left ?? []).map((l, i) => ({ key: i, text: `Left out: ${l.method} ${l.url} (${l.why})` })));

  async record(opts: { on?: boolean; clear?: boolean; reload?: boolean }): Promise<void> {
    await this.net.record(opts).catch((e: unknown) => this.net.error.set(e instanceof Error ? e.message : String(e)));
  }

  saveOpen = signal(false);
  saveFile = signal("");
  saveName = signal("Recorded");
  saveDescription = signal("");
  saveUrl = signal("");
  saveError = signal("");
  savePreviewCount = signal<{ mocks: number; left: number } | null>(null);
  fileOptions = computed(() => {
    const files = this.page.sceneIndex().map((f) => f.file);
    const t = this.state.target();
    return t.kind === "component" && !files.includes(t.scenes) ? [t.scenes, ...files] : files;
  });
  savePreview = computed(() => {
    const p = this.savePreviewCount();
    if (!p) return "Reading what was recorded…";
    return `${p.mocks} mock${p.mocks === 1 ? "" : "s"} (one per method and URL; the last response wins)${p.left ? `; ${p.left} response${p.left === 1 ? "" : "s"} cannot be a mock and are left out` : ""}.`;
  });
  canSave = computed(() => !!this.saveFile() && this.saveName().trim() !== "" && (this.savePreviewCount()?.mocks ?? 0) > 0);

  openSave(): void {
    const t = this.state.target();
    const files = this.fileOptions();
    const scenario = this.net.active()?.file;
    this.saveFile.set(t.kind === "component" ? t.scenes : scenario && files.includes(scenario) ? scenario : (files[0] ?? ""));
    this.saveUrl.set(this.page.url() || "/");
    this.saveError.set("");
    this.savePreviewCount.set(null);
    this.saveOpen.set(true);
    void this.net
      .recorded()
      .then((records) => {
        const { mocks, left } = mocksFromRecording(records);
        this.savePreviewCount.set({ mocks: mocks.length, left: left.length });
      })
      .catch((e: unknown) => this.saveError.set(e instanceof Error ? e.message : String(e)));
  }

  async save(): Promise<void> {
    this.saveError.set("");
    const r = await this.net.saveRecording({ file: this.saveFile(), name: this.saveName().trim(), description: this.saveDescription().trim(), url: this.isPage() ? this.saveUrl().trim() : undefined });
    if (!r.ok) return this.saveError.set(r.error);
    this.saveOpen.set(false);
  }

  // --- the active Scenario's mocks -----------------------------------------------------------------------------------------
  mocksTitle = computed(() => {
    const a = this.net.active();
    return a ? `Mocks of ${a.scene}` : "Mocks";
  });
  mocksWhy = computed(() => {
    const a = this.net.active();
    if (!a) return "No Scenario answers this frame, so nothing is mocked.";
    const m = this.net.mocks();
    if (!m) return "Reading the scenes file…";
    if (!m.ok) return m.error;
    const scene = this.net.activeMocks();
    if (!scene) return `${a.file} has no scene "${a.scene}" as written.`;
    if (scene.readonly) return scene.readonly;
    return scene.mocks.length ? null : "This scene has no HTTP mocks.";
  });
  mockRows = computed(() =>
    (this.net.activeMocks()?.mocks ?? []).map((m) => ({
      key: `${m.index}:${m.url}`,
      info: m,
      method: m.method ?? "any",
      url: m.url,
      reply: !m.reply ? "computed" : m.reply.error ? `fails: ${m.reply.error}` : `${m.reply.status ?? 200}${m.reply.delay ? ` · +${m.reply.delay} ms` : ""}`,
      bad: !!m.reply && (!!m.reply.error || (m.reply.status ?? 200) >= 400),
      editLabel: `Edit the mock of ${m.url}`,
      removeLabel: `Remove the mock of ${m.url}`,
      readonly: m.readonly,
    })),
  );
  mockError = signal("");

  async remove(m: MockInfo): Promise<void> {
    const scene = this.net.active()?.scene;
    if (!scene) return;
    this.mockError.set((await this.net.removeMock(scene, m.index, m.url)) ?? "");
  }

  editOpen = signal(false);
  editing = signal<MockInfo | null>(null);
  editStatus = signal("");
  editDelay = signal("");
  editFail = signal("");
  editBody = signal("");
  editError = signal("");
  editHeading = computed(() => {
    const m = this.editing();
    return m ? `Edit mock: ${m.method ?? "any"} ${m.url}` : "Edit mock";
  });

  openEdit(m: MockInfo): void {
    const r = m.reply;
    this.editing.set(m);
    this.editStatus.set(r?.status === null || r?.status === undefined ? "" : String(r.status));
    this.editDelay.set(r?.delay ? String(r.delay) : "");
    this.editFail.set(r?.error ?? "");
    this.editBody.set(r?.hasBody ? JSON.stringify(r.body, null, 2) : "");
    this.editError.set("");
    this.editOpen.set(true);
  }

  async saveEdit(): Promise<void> {
    const m = this.editing();
    const scene = this.net.active()?.scene;
    if (!m || !m.reply || !scene) return;
    const r = m.reply;
    const status = this.editStatus().trim() === "" ? null : Number(this.editStatus());
    const delay = this.editDelay().trim() === "" ? null : Number(this.editDelay());
    if (status !== null && !(Number.isInteger(status) && status >= 100 && status <= 599)) return this.editError.set("The status is a whole number from 100 to 599.");
    if (delay !== null && !(Number.isFinite(delay) && delay >= 0 && delay <= 60000)) return this.editError.set("The delay is 0 to 60000 ms.");
    let body: unknown = undefined;
    const text = this.editBody().trim();
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch (e) {
        return this.editError.set(`The body is not JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const fail = (this.editFail() || null) as "network" | "abort" | null;
    // Only what changed is written.
    const patch: Record<string, unknown> = {};
    if (status !== r.status) patch.status = status;
    if ((delay ?? 0) !== (r.delay ?? 0)) patch.delay = delay;
    if (fail !== r.error) patch.error = fail;
    if (text === "" ? r.hasBody : !r.hasBody || JSON.stringify(body) !== JSON.stringify(r.body)) patch.body = text === "" ? null : body;
    if (!Object.keys(patch).length) return this.editOpen.set(false);
    const error = await this.net.editMock(scene, m.index, patch, m.url);
    if (error) return this.editError.set(error);
    this.editOpen.set(false);
  }
}
