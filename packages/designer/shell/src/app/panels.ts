// The side panels. Templates only read signals (the language service enforces it), so each panel turns the Designer state into
// display-ready rows in a `computed` and the template just lays them out.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import type { Preview, TreeNode } from "@gable/core/devtools";
import type { OutlineRow } from "../../../src/server/edit/outline.js";
import type { PaletteEntry } from "../../../src/server/edit/types.js";

type OutlineResult = { ok: true; file: string; line: number; rows: OutlineRow[] } | { ok: false; error: string };
import { UiButton } from "../components/ui/button.js";
import { UiJsonViewer } from "../components/ui/json-viewer.js";
import { UiSelect } from "../components/ui/select.js";
import { UiToggleGroup, type ToggleGroupItem } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiTree, type TreeNode as UiTreeNode } from "../components/ui/tree.js";
import { UiIcon } from "../lib/ui/icon.js";
import { InsertDrag } from "./canvas-overlays.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";

/** The devtools Preview (JSON-safe, size-bounded) as a plain value the JSON viewer can walk; left-out children become a "…" entry. */
export function previewValue(p: Preview): unknown {
  switch (p.t) {
    case "number":
    case "boolean":
      return JSON.parse(p.s);
    case "null":
      return null;
    case "string":
      try {
        return JSON.parse(p.s);
      } catch {
        return p.s;
      }
    case "array":
    case "set": {
      const out: unknown[] = (p.children ?? []).map(([, c]) => previewValue(c));
      if (p.more) out.push(`… ${p.more} more`);
      return p.children ? out : p.s;
    }
    case "object":
    case "map": {
      if (!p.children) return p.s;
      const out: Record<string, unknown> = {};
      for (const [k, c] of p.children) out[k] = previewValue(c);
      if (p.more) out["…"] = `${p.more} more`;
      return out;
    }
    default:
      return p.s;
  }
}
const isStructured = (p: Preview) => !!p.children && p.children.length > 0;

/** The component tree: a gable-ui Tree (expand/collapse, roving focus, arrow keys). Selecting a row selects that component. */
export class ComponentTree {
  static meta = {
    selector: "app-component-tree",
    host: { class: "block" },
    imports: [UiTree],
    template: html`
      @if (empty()) {
        <div class="empty">No components yet.</div>
      } @else {
        <ui-tree [nodes]="nodes()" [(expanded)]="expanded" [(selected)]="selected" selectionMode="single" label="Component tree"></ui-tree>
      }
    `,
  };
  state = inject(DesignerState);
  nodes = computed(() => {
    const children = new Map<string | null, TreeNode[]>();
    for (const n of this.state.tree()) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
    const build = (parent: string | null): UiTreeNode[] =>
      (children.get(parent) ?? []).map((n) => {
        const kids = build(n.id);
        return { id: n.id, label: n.name, description: n.selector, ...(kids.length ? { children: kids } : {}) };
      });
    return build(null);
  });
  empty = computed(() => this.nodes().length === 0);
  expanded = signal<string[]>([]);
  selected = signal<string[]>([]);
  seen = new Set<string>();
  /** Branches start open: a component is expanded the first time it appears; collapsing it afterwards is the user's call. */
  openNew = effect(() => {
    const fresh = this.state.tree().filter((n) => !this.seen.has(n.id));
    if (!fresh.length) return;
    for (const n of fresh) this.seen.add(n.id);
    untracked(() => this.expanded.update((e) => [...e, ...fresh.map((n) => n.id)]));
  });
  /** The inspector's component (picked on the canvas or in the tree) is the tree's selection. */
  fromState = effect(() => {
    const id = this.state.component()?.id;
    untracked(() => {
      if (this.selected()[0] !== id) this.selected.set(id ? [id] : []);
    });
  });
  toState = effect(() => {
    const id = this.selected()[0];
    untracked(() => {
      if (id && id !== this.state.component()?.id) void this.state.selectComponent(id);
    });
  });
}

/**
 * The selected element's template as an outline (TASK-56.12): elements with their classes, bindings and `{{ }}` text, and the
 * control-flow blocks, which are read-only (what they render is decided at runtime). Rows not rendered right now are dimmed.
 * Clicking a row selects its element on the canvas; hovering highlights it.
 */
export class TemplateOutline {
  static meta = {
    selector: "app-template-outline",
    host: { class: "block" },
    // TODO(gable-ui): UiTree rows cannot carry chips and trailing notes, so plain rows stand in for a richer tree.
    template: html`
      @for (r of rows(); track r.key) {
        @if (r.block) {
          <div class="tr outline-row ro" [style.padding-left]="r.indent" data-part="outline-row" [attr.data-kind]="r.kind" [attr.title]="r.title">
            <span class="mono truncate">{{ r.label }}</span>
            @if (r.detail) {
              <span class="chip warn trail">{{ r.detail }}</span>
            }
          </div>
        } @else {
          <button
            class="tr outline-row"
            [class.sel]="r.selected"
            [class.off]="r.hidden"
            [style.padding-left]="r.indent"
            data-part="outline-row"
            [attr.data-kind]="r.kind"
            [attr.data-start]="r.start"
            [attr.aria-current]="r.current"
            [attr.title]="r.title"
            (click)="choose(r.start)"
            (pointerenter)="hover(r.start)"
            (pointerleave)="unhover()"
          >
            <span class="mono truncate">{{ r.label }}</span>
            @for (c of r.chips; track c) {
              <span class="chip mono">{{ c }}</span>
            }
            @if (r.detail) {
              <span class="dim trail">{{ r.detail }}</span>
            }
          </button>
        }
      }
      @if (note()) {
        <div class="empty">{{ note() }}</div>
      }
    `,
  };
  state = inject(DesignerState);
  edit = inject(EditState);
  outline = signal<OutlineResult | null>(null);
  /** Starts of the elements rendered right now (the rest are under an `@if` that is false, or an empty `@for`). */
  rendered = signal<Set<number> | null>(null);
  #raw = "";
  #liveSeq = 0;
  #hoverSeq = 0;

  load = effect(() => {
    const node = this.state.picked()?.node ?? null;
    this.edit.history();
    untracked(() => void this.#load(node && node.exact ? node : null));
  });
  /** Template changes re-render nodes; which rows are live is asked again after each update. */
  live = effect(() => {
    this.state.hmr();
    this.state.flushes();
    const o = this.outline();
    untracked(() => void this.#live(o && o.ok ? o.rows : []));
  });

  async #load(node: { raw: string; component: { source: { path: string } | null } | null } | null): Promise<void> {
    if (!node) {
      this.#raw = "";
      return this.outline.set(null);
    }
    this.#raw = node.raw;
    const r = await this.state
      .api<OutlineResult>("/api/edit/outline", { raw: node.raw, modulePath: node.component?.source?.path })
      .catch((e: unknown): OutlineResult => ({ ok: false, error: String(e) }));
    if (this.#raw === node.raw) this.outline.set(r);
  }

  async #live(rows: OutlineRow[]): Promise<void> {
    const seq = ++this.#liveSeq;
    const raw = this.#raw;
    const elements = rows.filter((r) => r.kind === "element").slice(0, 120);
    const found = await Promise.all(elements.map((r) => this.state.preview.call("nodeAt", { raw, offset: r.start }).catch(() => null)));
    if (seq !== this.#liveSeq) return;
    this.rendered.set(new Set(elements.filter((r, i) => (found[i]?.elements ?? 0) > 0 && found[i]!.start === r.start).map((r) => r.start)));
  }

  rows = computed(() => {
    const o = this.outline();
    if (!o || !o.ok) return [];
    const picked = this.state.picked()?.node;
    const live = this.rendered();
    return o.rows.map((r, i) => {
      const selected = !!picked && r.kind === "element" && picked.start === r.start;
      const hidden = r.kind === "element" && !!live && !live.has(r.start);
      return {
        key: `${i}:${r.start}`,
        kind: r.kind,
        block: r.kind !== "element",
        start: r.start,
        label: r.label,
        detail: r.detail,
        chips: r.interpolations,
        indent: `${8 + r.depth * 12}px`,
        selected,
        current: selected ? "true" : null,
        hidden,
        title: r.kind === "element" ? (hidden ? "Not rendered right now" : `Select <${r.tag}>`) : "Decided at runtime: read-only here",
      };
    });
  });
  note = computed(() => {
    const o = this.outline();
    if (!this.state.picked()) return "Select an element to see its template.";
    if (!o) return "";
    return o.ok ? (o.rows.length ? "" : "This template is empty.") : o.error;
  });

  async choose(start: number): Promise<void> {
    const node = await this.state.preview.call("nodeAt", { raw: this.#raw, offset: start }).catch(() => null);
    if (node && node.start === start) await this.state.preview.call("selectNode", { id: node.id }).catch(() => undefined);
  }

  unhover(): void {
    void this.hover(-1);
  }

  async hover(start: number): Promise<void> {
    const seq = ++this.#hoverSeq;
    const node = start >= 0 ? await this.state.preview.call("nodeAt", { raw: this.#raw, offset: start }).catch(() => null) : null;
    if (seq === this.#hoverSeq) await this.state.preview.call("hoverNode", { id: node && node.start === start ? node.id : null }).catch(() => undefined);
  }
}

/** The injector tree: each injector with the Providers behind its Tokens. */
export class InjectorTree {
  static meta = {
    selector: "app-injector-tree",
    host: { class: "block" },
    template: html`
      @for (inj of groups(); track inj.id) {
        <div class="sec-h">
          {{ inj.title }}
          <span class="count">{{ inj.count }}</span>
        </div>
        @for (entry of inj.entries; track entry.name) {
          <div class="inj-row">
            <span class="flex items-center gap-1">
              <span class="mono truncate">{{ entry.name }}</span>
              <span class="chip">{{ entry.kind }}</span>
            </span>
            @if (entry.target) {
              <span class="dim truncate">{{ entry.target }}</span>
            }
            <span class="mono truncate dim">{{ entry.value }}</span>
          </div>
        }
      }
      @if (empty()) {
        <div class="empty">No injectors yet.</div>
      }
    `,
  };
  state = inject(DesignerState);
  groups = computed(() =>
    this.state.injectors().map((n) => {
      const entries = this.state.injectorDetails()[n.id]?.entries ?? [];
      return {
        id: n.id,
        title: n.component ? n.component.name : "Root",
        count: entries.length,
        entries: entries.map((e) => ({ name: e.name, kind: e.provider?.kind ?? "instance", target: e.provider?.target ?? "", value: e.value.s })),
      };
    }),
  );
  empty = computed(() => this.groups().length === 0);
}

/** The Structure tab: which file of Scenarios is on the canvas, the live component tree, and that file's Scenarios. */
export class StructurePanel {
  static meta = {
    selector: "app-structure-panel",
    host: { class: "side" },
    imports: [ComponentTree, TemplateOutline, UiButton, UiIcon, UiSelect, UiTooltip],
    template: html`
      <div class="min-h-0 flex-1 overflow-auto">
        @if (showFiles()) {
          <div class="sec">
            <div class="sec-h">Component</div>
            <div class="pad">
              <ui-select triggerClass="fld-select w-full" placeholder="Pick a scenes file" [items]="fileItems()" [(value)]="filePick"></ui-select>
            </div>
          </div>
        }
        @if (picked()) {
          <div class="sec" aria-label="Template" data-part="template-outline">
            <div class="sec-h">
              Template
              <span class="mono dim truncate">{{ templateOf() }}</span>
            </div>
            <app-template-outline></app-template-outline>
          </div>
        }
        <div class="sec">
          <div class="sec-h">Components</div>
          <app-component-tree></app-component-tree>
        </div>
        @if (isComponentMode()) {
          <div class="sec">
            <div class="sec-h">
              Scenarios
              <span class="count">{{ sceneCount() }}</span>
              <span class="spacer"></span>
              <button uiButton variant="ghost" size="icon" class="btn sm icon" uiTooltip="New Scenario" aria-label="New Scenario" (click)="chrome.dialog.set('new-scenario')"><svg uiIcon="plus" class="ico-sm"></svg></button>
            </div>
            @for (s of scenes(); track s.name) {
              <button class="tr scene" [class.sel]="s.active" [attr.aria-current]="s.ariaCurrent" [attr.title]="s.description" (click)="state.chooseScene(s.name)">
                <span class="dot" [class.ok]="s.active"></span>
                <span class="truncate">{{ s.name }}</span>
                @if (s.active) {
                  <span class="chip on trail">active</span>
                }
              </button>
            }
            @if (noScenes()) {
              <div class="empty">
                <strong>{{ noScenesTitle() }}</strong>
                A Scenario is one way to render the component: its inputs and fake services, kept in a scenes file.
                <div class="mt-2">
                  <button uiButton variant="outline" size="sm" class="btn" (click)="chrome.dialog.set('new-scenario')">New Scenario</button>
                </div>
              </div>
            }
          </div>
        }
      </div>
      @if (footer()) {
        <div class="side-foot mono truncate" [attr.title]="footer()">{{ footer() }}</div>
      }
    `,
  };
  state = inject(DesignerState);
  chrome = inject(ChromeState);
  isComponentMode = computed(() => this.state.target().kind === "component");
  picked = computed(() => !!this.state.picked()?.node.exact);
  templateOf = computed(() => this.state.picked()?.node.component?.name ?? "");
  showFiles = computed(() => this.isComponentMode() && this.state.sceneFiles().length > 0);
  fileItems = computed(() => this.state.sceneFiles().map((path) => ({ value: path, label: path.split("/").pop() ?? path })));
  filePick = signal("");
  followFile = effect(() => {
    const target = this.state.target();
    const path = target.kind === "component" ? target.scenes : "";
    untracked(() => this.filePick.set(path));
  });
  chooseFile = effect(() => {
    const picked = this.filePick();
    untracked(() => {
      const target = this.state.target();
      if (picked && !(target.kind === "component" && target.scenes === picked)) this.state.showComponent(picked);
    });
  });
  scenes = computed(() => {
    const active = this.state.scene();
    return (this.state.sceneInfo()?.scenes ?? []).map((s) => ({ name: s.name, description: s.description ?? "", active: s.name === active, ariaCurrent: s.name === active ? "true" : null }));
  });
  sceneCount = computed(() => this.scenes().length);
  noScenes = computed(() => this.scenes().length === 0);
  noScenesTitle = computed(() => {
    const name = this.state.sceneInfo()?.component;
    return name ? `${name} has no Scenarios yet` : "No Scenarios yet";
  });
  footer = computed(() => {
    const target = this.state.target();
    return target.kind === "component" ? target.scenes : "";
  });
}

const WHERE_LABEL: Array<{ value: string; label: string }> = [
  { value: "after", label: "After the selection" },
  { value: "before", label: "Before the selection" },
  { value: "last", label: "Inside, at the end" },
  { value: "first", label: "Inside, at the start" },
];

/** The Insert tab: what can be added to the template, as a source edit relative to the selection. */
export class InsertPanel {
  static meta = {
    selector: "app-insert-panel",
    host: { class: "side" },
    imports: [UiToggleGroup, UiIcon],
    // TODO(gable-ui): an Input with a leading icon and a clear button; a label holding a bare input stands in.
    template: html`
      <div class="flex flex-col gap-2 p-2">
        <label class="fld">
          <svg uiIcon="search" class="ico-sm dim"></svg>
          <input class="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search components" aria-label="Search components" [value]="query()" (input)="query.set($event.currentTarget.value)" />
        </label>
        <ui-toggle-group class="seg small fill" data-part="insert-sources" [items]="sources" [(value)]="source" type="single" variant="outline" size="sm"></ui-toggle-group>
        <select class="fld" aria-label="Where" (change)="where.set($event.currentTarget.value)">
          @for (w of wheres(); track w.value) {
            <option [value]="w.value" [selected]="w.selected">{{ w.label }}</option>
          }
        </select>
      </div>
      <div class="min-h-0 flex-1 overflow-auto px-1">
        @for (g of groups(); track g.title) {
          <div class="sec-h">{{ g.title }}</div>
          @for (p of g.entries; track p.key) {
            <button class="mi" [attr.title]="p.snippet" [attr.data-insert]="p.name" (pointerdown)="dragStart($event, p.name, p.group)" (click)="insert(p.name, p.group)">
              <span class="truncate">{{ p.name }}</span>
              @if (p.tag) {
                <span class="mono dim truncate">{{ p.tag }}</span>
              }
            </button>
          }
        }
        @if (none()) {
          <div class="empty">{{ noneText() }}</div>
        }
      </div>
      <div class="side-foot">{{ footer() }}</div>
      @if (drag.ghost(); as g) {
        <div class="drag-ghost" data-part="drag-ghost" [style.left]="g.left" [style.top]="g.top">
          <span>{{ g.name }}</span>
          <span class="dim">{{ g.where }}</span>
        </div>
      }
    `,
  };
  edit = inject(EditState);
  drag = inject(InsertDrag);
  query = signal("");
  sources: ToggleGroupItem[] = [
    { value: "gable-ui", label: "gable-ui" },
    { value: "project", label: "This project" },
    { value: "html", label: "HTML" },
  ];
  source = signal<string[]>(["gable-ui"]);
  keepOne = effect(() => {
    if (this.source().length === 0) untracked(() => this.source.set(["gable-ui"]));
  });
  /** Opens on the first source that has something in it: a project without gable-ui components has an empty first tab. */
  #opened = false;
  openOnFilled = effect(() => {
    const palette = this.edit.palette();
    if (this.#opened || palette.length === 0) return;
    this.#opened = true;
    const first = this.sources.find((s) => palette.some((p) => p.group === s.value));
    if (first) untracked(() => this.source.set([first.value]));
  });
  where = signal("after");
  wheres = computed(() => WHERE_LABEL.map((w) => ({ ...w, selected: w.value === this.where() })));
  noSelection = computed(() => this.edit.target() === null || this.edit.node() === null);
  entries = computed(() => {
    const q = this.query().trim().toLowerCase();
    const group = this.source()[0] as PaletteEntry["group"] | undefined;
    return this.edit.palette().filter((p) => p.group === group && (!q || `${p.name} ${p.selector ?? ""}`.toLowerCase().includes(q)));
  });
  groups = computed(() => {
    const rows = this.entries().map((p) => ({ key: `${p.group}:${p.name}`, name: p.name, group: p.group, snippet: p.snippet, tag: p.selector ?? "" }));
    return rows.length ? [{ title: this.sources.find((s) => s.value === this.source()[0])?.label ?? "", entries: rows }] : [];
  });
  none = computed(() => this.entries().length === 0);
  noneText = computed(() => (this.query().trim() ? "Nothing matches that search." : this.source()[0] === "gable-ui" ? "This project has no gable-ui components installed." : "This project has no components of its own yet."));
  footer = computed(() => (this.noSelection() ? "Drag onto a frame, or select an element to insert next to it." : "Drag onto a frame, or press Enter to insert next to the selection."));

  dragStart(e: PointerEvent, name: string, group: string): void {
    this.drag.start(e, this.edit.palette().find((p) => p.name === name && p.group === group));
  }

  insert(name: string, group: string): void {
    if (this.drag.takeClick()) return;
    const entry = this.edit.palette().find((p) => p.name === name && p.group === group);
    if (!entry) return;
    if (this.noSelection()) return void this.edit.notice.set({ ok: false, text: `Select an element first, or drag ${name} onto a frame.` });
    const where = this.where() as "before" | "after" | "first" | "last";
    void this.edit.edit((target) => ({ op: "insert", target, where, snippet: entry.snippet, component: entry.component }));
  }
}

/** The owning component's live signals, the injector tree, the inputs and outputs, and the picked template node. */
export class Inspector {
  static meta = {
    selector: "app-inspector",
    host: { class: "block" },
    imports: [InjectorTree, UiJsonViewer],
    template: html`
      @if (comp().show) {
        <div class="sec">
          <div class="sec-h">
            Signals · {{ comp().name }}
            <span class="spacer"></span>
            <span class="chip ok">live</span>
          </div>
          @for (s of comp().signals; track s.id) {
            <div class="inj-row">
              <span class="flex items-baseline justify-between gap-3">
                <span class="mono">{{ s.name }} <span class="dim">{{ s.kind }}</span></span>
                @if (!s.structured) {
                  <span class="mono truncate">{{ s.value }}</span>
                }
              </span>
              @if (s.structured) {
                <ui-json-viewer class="mono" [value]="s.data" [label]="s.name" [rootLabel]="s.name" treeClass="max-h-48"></ui-json-viewer>
              }
            </div>
          }
          @if (comp().noSignals) {
            <div class="empty">This component has no signals.</div>
          }
        </div>
        <div class="sec">
          <div class="sec-h">Inputs and outputs</div>
          @for (s of comp().inputs; track s.id) {
            <div class="inj-row">
              <span class="flex items-baseline justify-between gap-3">
                <span class="mono">{{ s.name }} <span class="chip">input</span></span>
                @if (!s.structured) {
                  <span class="mono truncate">{{ s.value }}</span>
                }
              </span>
              @if (s.structured) {
                <ui-json-viewer class="mono" [value]="s.data" [label]="s.name" [rootLabel]="s.name" treeClass="max-h-48"></ui-json-viewer>
              }
            </div>
          }
          @for (o of comp().outputs; track o) {
            <div class="inj-row"><span class="mono">{{ o }} <span class="chip">output</span></span></div>
          }
          @if (comp().noPorts) {
            <div class="empty">No inputs or outputs.</div>
          }
        </div>
      }
      @if (node().show) {
        <div class="sec">
          <div class="sec-h">Template node</div>
          <div class="inj-row">
            <span class="flex items-center gap-2">
              <span class="mono">{{ node().tag }}</span>
              <span class="chip">{{ node().rendered }}</span>
            </span>
            <span class="dim">in {{ node().owner }}</span>
            <span class="mono dim" style="word-break: break-all">{{ node().where }}</span>
            <pre class="code card insp-code">{{ node().opening }}</pre>
          </div>
        </div>
      }
      @if (hint()) {
        <div class="empty"><strong>Nothing selected</strong>Click an element on the canvas, or a component in the tree.</div>
      }
      <div class="sec-h">Injector</div>
      <app-injector-tree></app-injector-tree>
    `,
  };
  state = inject(DesignerState);
  node = computed(() => {
    const p = this.state.picked();
    if (!p) return { show: false, tag: "", rendered: "", owner: "", where: "", opening: "" };
    const s = p.source;
    return {
      show: true,
      tag: `<${p.node.tag}>`,
      rendered: `${p.node.elements} rendered`,
      owner: p.node.component?.name ?? "unknown",
      where: !s ? "locating…" : "error" in s ? s.error : `${this.state.relative(s.file)}:${s.from.line}:${s.from.col}`,
      opening: s && !("error" in s) ? s.openingTag : "",
    };
  });
  comp = computed(() => {
    const c = this.state.component();
    if (!c) return { show: false, name: "", inputs: [], outputs: [] as string[], signals: [], noSignals: false, noPorts: false };
    const row = (s: (typeof c.signals)[number]) => ({ id: s.id, name: s.name, kind: s.kind, value: s.value.s, structured: isStructured(s.value), data: isStructured(s.value) ? previewValue(s.value) : undefined });
    return { show: true, name: c.name, inputs: c.inputs.map(row), outputs: c.outputs, signals: c.signals.map(row), noSignals: c.signals.length === 0, noPorts: c.inputs.length === 0 && c.outputs.length === 0 };
  });
  hint = computed(() => !this.node().show && !this.comp().show);
}
