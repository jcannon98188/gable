// The page-mode UI: the Routes tab (route tree with add and edit written back to the route config, the scenario picker, the
// active scenario's mocks); the drawer's Network panel is network-panel.ts. The URL bar lives in the canvas toolbar
// (see DeviceBar). Like the panels, templates only read signals; the components turn the state into display-ready rows in `computed`s.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiDialog } from "../components/ui/dialog.js";
import { UiSelect } from "../components/ui/select.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiTree, type TreeNode as UiTreeNode } from "../components/ui/tree.js";
import { UiIcon } from "../lib/ui/icon.js";
import { DesignerState } from "./designer-state.js";
import { PageState, type RouteRow } from "./page-state.js";

interface Row extends RouteRow {
  id: string;
  editable: boolean;
  hasParams: boolean;
  label: string;
  detail: string;
}

/** The route tree, the scenario the page runs under, and that scenario's HTTP mocks. */
export class RoutesPanel {
  static meta = {
    selector: "app-routes-panel",
    host: { class: "side" },
    imports: [UiButton, UiDialog, UiIcon, UiSelect, UiTooltip, UiTree],
    template: html`
      <div class="min-h-0 flex-1 overflow-auto">
        <div class="sec">
          <div class="sec-h">
            Route tree
            <span class="spacer"></span>
            <button uiButton variant="ghost" size="icon" class="btn sm icon" uiTooltip="Add route" aria-label="Add route" [disabled]="!canEdit()" (click)="addRoot()"><svg uiIcon="plus" class="ico-sm"></svg></button>
          </div>
          @if (empty()) {
            <div class="empty">This app has no router, or it has not started yet.</div>
          } @else {
            <ui-tree class="route-tree" [nodes]="nodes()" [(expanded)]="expanded" [(selected)]="selected" selectionMode="single" label="Routes" (activated)="activate($event)" (action)="onAction($event)"></ui-tree>
          }
          @if (saved()) {
            <p class="callout" role="status">{{ saved() }}</p>
          }
        </div>
        <div class="sec">
          <div class="sec-h">Scenario</div>
          <div class="pad">
            <ui-select triggerClass="fld-select w-full" placeholder="Scenario" [items]="page.scenarioItems()" [(value)]="pick"></ui-select>
          </div>
        </div>
        <div class="sec">
          <div class="sec-h">
            Mock HTTP
            <span class="count">{{ mockCount() }}</span>
          </div>
          @if (noMocks()) {
            <div class="empty">{{ mockHint() }}</div>
          }
          @for (m of mocks(); track m.index) {
            <div class="card mock">
              <span class="chip mono">{{ m.method }}</span>
              <span class="mono truncate flex-1" [attr.title]="m.url">{{ m.url }}</span>
              <span class="dim">{{ m.hits }}</span>
            </div>
          }
        </div>
      </div>
      <div class="side-foot mono truncate" [attr.title]="where()">{{ where() }}</div>

      <ui-dialog [(open)]="formOpen" [heading]="formTitle()" description="Written to the route config in the source file." contentClass="dlg">
        <form (submit)="submit($event)">
          <label class="form-row"><span>Path</span>
            <input class="fld mono" name="path" placeholder="products/:id" [value]="fPath()" (input)="fPath.set($event.currentTarget.value)" />
          </label>
          <label class="form-row"><span>Component</span>
            <select class="fld" name="component" (change)="fComponent.set($event.currentTarget.value)">
              @for (c of componentOptions(); track c.value) {
                <option [value]="c.value" [selected]="c.selected">{{ c.label }}</option>
              }
            </select>
          </label>
          <label class="form-row"><span>Title</span>
            <input class="fld" name="title" [value]="fTitle()" (input)="fTitle.set($event.currentTarget.value)" />
          </label>
          <label class="form-row"><span>Redirect to</span>
            <input class="fld mono" name="redirectTo" [value]="fRedirect()" (input)="fRedirect.set($event.currentTarget.value)" />
          </label>
          <div class="form-row"><span>Parent</span><span class="mono">{{ parentText() }}</span></div>
          <pre class="code card route-preview">{{ preview() }}</pre>
          <p class="dim route-note">Lazy loading and guards are not offered here yet: write those in the route config.</p>
          @if (error()) {
            <p class="callout err" role="alert">{{ error() }}</p>
          }
          <div class="flex justify-end gap-2">
            <button uiButton size="sm" variant="outline" class="btn" type="button" (click)="page.openForm(null)">Cancel</button>
            <button uiButton size="sm" class="btn" type="submit">Save to source</button>
          </div>
        </form>
      </ui-dialog>
    `,
  };
  state = inject(DesignerState);
  page = inject(PageState);

  fPath = signal("");
  fTitle = signal("");
  fRedirect = signal("");
  fComponent = signal("");

  form = this.page.form;
  error = this.page.formError;
  saved = this.page.saved;
  canEdit = computed(() => this.page.config() !== null);
  empty = computed(() => this.page.rows().length === 0);
  where = computed(() => this.page.config()?.file ?? "route config not found in source");

  /** The dialog's two-way open state, in step with the page's form. */
  formOpen = signal(false);
  followForm = effect(() => {
    const form = this.page.form();
    untracked(() => {
      if (form?.mode === "add" && !this.formOpen()) {
        this.fPath.set("");
        this.fTitle.set("");
        this.fRedirect.set("");
        this.fComponent.set("");
      }
      this.formOpen.set(form !== null);
    });
  });
  closeForm = effect(() => {
    const open = this.formOpen();
    if (!open && untracked(this.page.form) !== null) untracked(() => this.page.openForm(null));
  });

  /** The picker's two-way value, kept in step with the page's scenario in both directions. */
  pick = signal("none");
  follow = effect(() => {
    const current = this.page.scenarioValue();
    untracked(() => this.pick.set(current));
  });
  choose = effect(() => {
    const picked = this.pick();
    if (picked !== untracked(this.page.scenarioValue)) untracked(() => this.page.chooseScenario(picked));
  });

  rows = computed<Row[]>(() =>
    this.page.rows().map((r) => ({
      ...r,
      id: `${r.key}|${r.path}|${r.depth}`,
      editable: r.at !== null && this.canEdit(),
      hasParams: r.url.includes(":"),
      label: r.path,
      detail: r.redirectTo ? `→ ${r.redirectTo}` : r.lazy ? "lazy children" : r.component,
    })),
  );
  /** Rows come flat, parents first, with a depth: the tree is rebuilt from them. */
  nodes = computed<UiTreeNode[]>(() => {
    const roots: UiTreeNode[] = [];
    const stack: UiTreeNode[] = [];
    for (const row of this.rows()) {
      const node: UiTreeNode = {
        id: row.id,
        label: row.label,
        description: row.detail,
        ...(row.editable
          ? {
              actions: [
                { id: "edit", label: `Edit route ${row.label}`, text: "Edit" },
                { id: "add", label: `Add a route under ${row.label}`, text: "+" },
              ],
            }
          : {}),
      };
      stack.length = row.depth;
      const parent = stack[row.depth - 1];
      if (parent) parent.children = [...(parent.children ?? []), node];
      else roots.push(node);
      stack[row.depth] = node;
    }
    return roots;
  });
  expanded = signal<string[]>([]);
  selected = signal<string[]>([]);
  #seen = new Set<string>();
  /** Branches start open; collapsing one afterwards is the user's call. The active route is the tree's selection. */
  openNew = effect(() => {
    const fresh = this.rows().filter((r) => !this.#seen.has(r.id));
    for (const r of fresh) this.#seen.add(r.id);
    if (fresh.length) untracked(() => this.expanded.update((e) => [...e, ...fresh.map((r) => r.id)]));
  });
  markActive = effect(() => {
    const active = this.rows().filter((r) => r.active);
    const last = active[active.length - 1];
    untracked(() => this.selected.set(last ? [last.id] : []));
  });

  mocks = computed(() => {
    const log = this.page.httpLog();
    return (this.page.scenario()?.mocks ?? []).map((m, index) => {
      const hits = log.filter((e) => e.mock === index).length;
      return { index, method: m.method, url: m.url, hits: `${hits} hit${hits === 1 ? "" : "s"}` };
    });
  });
  mockCount = computed(() => this.mocks().length);
  noMocks = computed(() => this.mocks().length === 0);
  mockHint = computed(() => (this.page.scenario() ? "This scenario mocks no requests." : "No scenario: the app talks to its real backend."));

  formTitle = computed(() => (this.page.form()?.mode === "edit" ? "Edit route" : "Add route"));
  parentText = computed(() => {
    const f = this.page.form();
    if (!f) return "";
    const at = f.mode === "add" ? f.parent : f.at.slice(0, -1);
    if (at.length === 0) return "(top level)";
    return this.page.rows().find((r) => r.at?.join(".") === at.join("."))?.path ?? at.join(".");
  });
  preview = computed(() => {
    const parts = [`path: ${JSON.stringify(this.fPath().trim())}`];
    if (this.fComponent()) parts.push(`component: ${this.fComponent()}`);
    if (this.fTitle()) parts.push(`title: ${JSON.stringify(this.fTitle())}`);
    if (this.fRedirect().trim()) parts.push(`redirectTo: ${JSON.stringify(this.fRedirect().trim())}`);
    return `{ ${parts.join(", ")} }`;
  });
  componentOptions = computed(() => {
    const chosen = this.fComponent();
    const names = this.page.components().map((c) => c.name);
    const all = chosen && !names.includes(chosen) ? [chosen, ...names] : names;
    return [{ value: "", label: "(none)", selected: chosen === "" }, ...all.map((n) => ({ value: n, label: n, selected: n === chosen }))];
  });

  activate(node: UiTreeNode): void {
    const row = this.rows().find((r) => r.id === node.id);
    if (row) this.open(row);
  }

  onAction(e: { node: UiTreeNode; action: string }): void {
    const row = this.rows().find((r) => r.id === e.node.id);
    if (!row) return;
    if (e.action === "edit") this.edit(row);
    else this.add(row.at);
  }

  /** A route with `:param` segments cannot be navigated to as it is: it goes to the URL bar for the user to fill in. */
  open(row: Row): void {
    if (row.hasParams) {
      this.page.urlText.set(row.url);
      this.page.editing.set(true);
    } else void this.page.navigate(row.url);
  }

  addRoot(): void {
    this.add([]);
  }

  add(parent: number[] | null): void {
    this.fPath.set("");
    this.fTitle.set("");
    this.fRedirect.set("");
    this.fComponent.set("");
    this.page.openForm({ mode: "add", parent: parent ?? [] });
  }

  edit(row: Row): void {
    if (!row.at) return;
    this.fPath.set(row.path === "(index)" ? "" : row.path);
    this.fTitle.set(row.title);
    this.fRedirect.set(row.redirectTo);
    this.fComponent.set(row.component);
    this.page.openForm({ mode: "edit", at: row.at });
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    const form = this.page.form();
    if (!form) return;
    const components = this.page.components();
    const ref = (name: string) => ({ name, from: components.find((c) => c.name === name)?.file });
    if (form.mode === "add") {
      const route = {
        path: this.fPath().trim(),
        ...(this.fComponent() ? { component: ref(this.fComponent()) } : {}),
        ...(this.fTitle() ? { title: this.fTitle() } : {}),
        ...(this.fRedirect() ? { redirectTo: this.fRedirect().trim() } : {}),
      };
      await this.page.save({ op: "add", parent: form.parent, route });
      return;
    }
    const before = this.page.rows().find((r) => r.at && r.at.join(".") === form.at.join("."));
    const set: { path?: string; title?: string | null; redirectTo?: string | null; component?: { name: string; from?: string } | null } = {};
    if (!before || this.fPath().trim() !== (before.path === "(index)" ? "" : before.path)) set.path = this.fPath().trim();
    if (this.fTitle() !== (before?.title ?? "")) set.title = this.fTitle() || null;
    if (this.fRedirect().trim() !== (before?.redirectTo ?? "")) set.redirectTo = this.fRedirect().trim() || null;
    if (this.fComponent() !== (before?.component ?? "")) set.component = this.fComponent() ? ref(this.fComponent()) : null;
    if (Object.keys(set).length === 0) return this.page.openForm(null);
    await this.page.save({ op: "set", at: form.at, set });
  }
}

