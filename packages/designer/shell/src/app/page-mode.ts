// The page-mode UI: a URL bar and scenario picker above the canvas, the route tree (with add and edit, written back to the
// route config), and the mocked HTTP traffic. Like the panels, templates only read signals; the components turn the state
// into display-ready rows in `computed`s.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { UiBadge } from "../components/ui/badge.js";
import { UiButton } from "../components/ui/button.js";
import { UiSelect } from "../components/ui/select.js";
import { DesignerState } from "./designer-state.js";
import { PageState, type RouteRow } from "./page-state.js";

/** The URL bar and the scenario picker. Shown in page mode only. */
export class PageBar {
  static meta = {
    selector: "app-page-bar",
    host: { class: "block" },
    imports: [UiButton, UiSelect],
    template: html`
      @if (shown()) {
        <div class="flex items-center gap-2 border-b px-2 py-1.5">
          <input
            class="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="URL"
            spellcheck="false"
            [value]="page.urlText()"
            [disabled]="!page.hasRouter()"
            (input)="typed($event.currentTarget.value)"
            (keydown)="onKeydown($event.key)"
            (blur)="page.editing.set(false)"
          />
          <button uiButton size="sm" variant="outline" [disabled]="!page.hasRouter()" (click)="page.go()">Go</button>
          <ui-select
            triggerClass="h-8 w-64"
            placeholder="Scenario"
            [items]="page.scenarioItems()"
            [(value)]="pick"
          ></ui-select>
        </div>
      }
    `,
  };
  state = inject(DesignerState);
  page = inject(PageState);
  shown = computed(() => this.state.target().kind === "page");
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
  typed(text: string): void {
    this.page.editing.set(true);
    this.page.urlText.set(text);
  }
  onKeydown(key: string): void {
    if (key === "Enter") void this.page.go();
  }
}

interface Row extends RouteRow {
  indent: string;
  id: string;
  level: number;
  editable: boolean;
  hasParams: boolean;
  label: string;
  detail: string;
}

/**
 * The route tree: every route of the config as written in the source, the active ones marked; clicking one navigates.
 * TODO(gable-ui): Tree. This is a flat list indented by depth, like the component tree, until the shell adopts the tree component.
 */
export class RoutesPanel {
  static meta = {
    selector: "app-routes-panel",
    host: { class: "block" },
    imports: [UiButton],
    template: html`
      <div class="flex flex-col gap-2 p-2 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span class="truncate text-xs text-muted-foreground">{{ where() }}</span>
          <button uiButton size="sm" variant="outline" [disabled]="!canEdit()" (click)="addRoot()">Add route</button>
        </div>
        <div class="flex flex-col gap-px" role="tree" aria-label="Routes">
          @for (row of rows(); track row.id) {
            <div class="flex items-center gap-1" role="treeitem" [attr.aria-level]="row.level" [attr.aria-selected]="row.active" [style.padding-left]="row.indent">
              <button class="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-accent" [class.bg-accent]="row.active" (click)="open(row)">
                <span class="truncate font-mono">{{ row.label }}</span>
                <span class="truncate text-xs text-muted-foreground">{{ row.detail }}</span>
              </button>
              @if (row.editable) {
                <button uiButton size="sm" variant="ghost" class="h-7 px-2" aria-label="Edit route" (click)="edit(row)">Edit</button>
                <button uiButton size="sm" variant="ghost" class="h-7 px-2" aria-label="Add child route" (click)="add(row.at)">+</button>
              }
            </div>
          }
        </div>
        @if (empty()) {
          <p class="text-muted-foreground">This app has no router, or it has not started yet.</p>
        }
        @if (saved()) {
          <p class="text-xs text-muted-foreground">{{ saved() }}</p>
        }
        @if (form()) {
          <form class="flex flex-col gap-2 rounded-md border p-2" (submit)="submit($event)">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ formTitle() }}</h3>
            <label class="flex flex-col gap-0.5 text-xs">Path
              <input class="h-8 rounded-md border border-input bg-transparent px-2 font-mono text-sm" name="path" [value]="fPath()" (input)="fPath.set($event.currentTarget.value)" />
            </label>
            <label class="flex flex-col gap-0.5 text-xs">Component
              <select class="h-8 rounded-md border border-input bg-transparent px-2 text-sm" name="component" (change)="fComponent.set($event.currentTarget.value)">
                @for (c of componentOptions(); track c.value) {
                  <option [value]="c.value" [selected]="c.selected">{{ c.label }}</option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-0.5 text-xs">Title
              <input class="h-8 rounded-md border border-input bg-transparent px-2 text-sm" name="title" [value]="fTitle()" (input)="fTitle.set($event.currentTarget.value)" />
            </label>
            <label class="flex flex-col gap-0.5 text-xs">Redirect to
              <input class="h-8 rounded-md border border-input bg-transparent px-2 font-mono text-sm" name="redirectTo" [value]="fRedirect()" (input)="fRedirect.set($event.currentTarget.value)" />
            </label>
            @if (error()) {
              <p class="text-xs text-destructive" role="alert">{{ error() }}</p>
            }
            <div class="flex gap-2">
              <button uiButton size="sm" type="submit">Save to source</button>
              <button uiButton size="sm" variant="outline" type="button" (click)="page.openForm(null)">Cancel</button>
            </div>
          </form>
        }
      </div>
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
  rows = computed<Row[]>(() =>
    this.page.rows().map((r) => ({
      ...r,
      indent: `${r.depth * 14 + 4}px`,
      id: `${r.key}|${r.path}|${r.depth}`,
      level: r.depth + 1,
      editable: r.at !== null && this.canEdit(),
      hasParams: r.url.includes(":"),
      label: r.path,
      detail: r.redirectTo ? `→ ${r.redirectTo}` : r.lazy ? "lazy children" : r.component,
    })),
  );
  formTitle = computed(() => {
    const f = this.page.form();
    return f?.mode === "edit" ? `Edit route ${f.at.join(".")}` : "Add route";
  });
  componentOptions = computed(() => {
    const chosen = this.fComponent();
    const names = this.page.components().map((c) => c.name);
    const all = chosen && !names.includes(chosen) ? [chosen, ...names] : names;
    return [{ value: "", label: "(none)", selected: chosen === "" }, ...all.map((n) => ({ value: n, label: n, selected: n === chosen }))];
  });

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

/** The mocks of the active scenario and the requests they answered. */
export class HttpPanel {
  static meta = {
    selector: "app-http-panel",
    host: { class: "block" },
    imports: [UiBadge],
    template: html`
      <div class="flex flex-col gap-3 p-2 text-sm">
        <p class="text-muted-foreground">{{ summary() }}</p>
        @if (hasMocks()) {
          <section class="rounded-md border">
            <header class="border-b px-2 py-1.5 font-medium">Mocks</header>
            <ul class="divide-y">
              @for (m of mocks(); track m.index) {
                <li class="flex items-center gap-2 px-2 py-1.5">
                  <span uiBadge variant="outline">{{ m.method }}</span>
                  <span class="truncate font-mono text-xs">{{ m.url }}</span>
                  <span class="ml-auto text-xs text-muted-foreground">{{ m.hits }}</span>
                </li>
              }
            </ul>
          </section>
        }
        <section class="rounded-md border">
          <header class="border-b px-2 py-1.5 font-medium">Requests</header>
          <ul class="divide-y">
            @for (r of requests(); track r.key) {
              <li class="flex items-center gap-2 px-2 py-1.5">
                <span uiBadge [variant]="r.variant">{{ r.outcome }}</span>
                <span class="font-mono text-xs">{{ r.method }}</span>
                <span class="truncate font-mono text-xs">{{ r.url }}</span>
              </li>
            }
          </ul>
          @if (noRequests()) {
            <p class="p-2 text-muted-foreground">None yet.</p>
          }
        </section>
      </div>
    `,
  };
  page = inject(PageState);
  state = inject(DesignerState);
  summary = computed(() => {
    if (this.state.target().kind === "component") return this.state.sceneInfo() ? "Component mode: the scene's HTTP mocks answer its calls." : "";
    const s = this.page.scenario();
    if (!s) return "No scenario: the app talks to its real backend. Pick a scenario in the bar above the canvas to mock it.";
    return `Scenario ${s.name}: ${s.mocks.length} mock${s.mocks.length === 1 ? "" : "s"}. The app's HTTP calls go to them, not the network.`;
  });
  mocks = computed(() => {
    const log = this.page.httpLog();
    return (this.page.scenario()?.mocks ?? []).map((m, index) => ({ index, method: m.method, url: m.url, hits: log.filter((e) => e.mock === index).length }));
  });
  hasMocks = computed(() => this.mocks().length > 0);
  requests = computed(() =>
    this.page.httpLog().map((e, i) => ({
      key: `${i}:${e.at}`,
      method: e.method,
      url: e.url,
      outcome: e.mock < 0 ? "no mock" : e.outcome,
      variant: (e.mock < 0 || e.outcome === "network" || Number(e.outcome) >= 400 ? "destructive" : "secondary") as "destructive" | "secondary",
    })),
  );
  noRequests = computed(() => this.page.httpLog().length === 0);
}
