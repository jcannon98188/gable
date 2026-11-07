// The panels. Templates only read signals (the language service enforces it), so each panel turns the Designer state into
// display-ready rows in a `computed` and the template just lays them out.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import type { TreeNode } from "@gable/core/devtools";
import { UiBadge } from "../components/ui/badge.js";
import { UiButton } from "../components/ui/button.js";
import { UiSeparator } from "../components/ui/separator.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiTree, type TreeNode as UiTreeNode } from "../components/ui/tree.js";
import { DesignerState } from "./designer-state.js";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** The component tree: a gable-ui Tree (expand/collapse, roving focus, arrow keys). Selecting a row selects that component. */
export class ComponentTree {
  static meta = {
    selector: "app-component-tree",
    host: { class: "block" },
    imports: [UiTree],
    template: html`
      @if (empty()) {
        <p class="p-2 text-sm text-muted-foreground">No components yet.</p>
      } @else {
        <ui-tree class="p-2" [nodes]="nodes()" [(expanded)]="expanded" [(selected)]="selected" selectionMode="single" label="Component tree"></ui-tree>
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

/** The injector tree: each injector with the Providers behind its Tokens. */
export class InjectorTree {
  static meta = {
    selector: "app-injector-tree",
    host: { class: "block" },
    imports: [UiBadge],
    template: html`
      <div class="flex flex-col gap-3 p-2">
        @for (inj of groups(); track inj.id) {
          <section class="rounded-md border">
            <header class="flex items-center gap-2 border-b px-2 py-1.5 text-sm font-medium">
              {{ inj.title }}
              <span uiBadge variant="secondary">{{ inj.count }}</span>
            </header>
            <ul class="divide-y">
              @for (entry of inj.entries; track entry.name) {
                <li class="flex flex-col gap-0.5 px-2 py-1.5 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="font-mono">{{ entry.name }}</span>
                    <span uiBadge variant="outline">{{ entry.kind }}</span>
                  </div>
                  <span class="truncate text-xs text-muted-foreground">{{ entry.target }}</span>
                  <span class="truncate font-mono text-xs">{{ entry.value }}</span>
                </li>
              }
            </ul>
          </section>
        }
        @if (empty()) {
          <p class="p-2 text-sm text-muted-foreground">No injectors yet.</p>
        }
      </div>
    `,
  };
  state = inject(DesignerState);
  groups = computed(() =>
    this.state.injectors().map((n) => {
      const entries = this.state.injectorDetails()[n.id]?.entries ?? [];
      return {
        id: n.id,
        title: n.component ? n.component.name : "root",
        count: entries.length,
        entries: entries.map((e) => ({ name: e.name, kind: e.provider?.kind ?? "instance", target: e.provider?.target ?? "", value: e.value.s })),
      };
    }),
  );
  empty = computed(() => this.groups().length === 0);
}

/** The scenes of every `*.scenes.ts` file; picking a file loads component mode, picking a scene mounts it. */
export class ScenesPanel {
  static meta = {
    selector: "app-scenes-panel",
    host: { class: "block" },
    imports: [UiButton],
    template: html`
      <div class="flex flex-col gap-3 p-2">
        <button uiButton variant="outline" size="sm" (click)="state.showPage()">Page mode</button>
        @for (file of files(); track file.path) {
          <section class="flex flex-col gap-1">
            <button
              class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
              [class.bg-accent]="file.current"
              (click)="state.showComponent(file.path)"
            >
              <span class="truncate font-mono text-xs">{{ file.path }}</span>
            </button>
            @for (scene of file.scenes; track scene.name) {
              <button
                class="ml-4 flex flex-col items-start rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                [class.bg-accent]="scene.active"
                (click)="state.chooseScene(scene.name)"
              >
                <span class="font-medium">{{ scene.name }}</span>
                <span class="text-xs text-muted-foreground">{{ scene.description }}</span>
              </button>
            }
          </section>
        }
        @if (none()) {
          <p class="p-2 text-sm text-muted-foreground">No *.scenes.ts files in this project.</p>
        }
      </div>
    `,
  };
  state = inject(DesignerState);
  files = computed(() => {
    const target = this.state.target();
    const scenes = this.state.sceneInfo()?.scenes ?? [];
    const active = this.state.scene();
    return this.state.sceneFiles().map((path) => {
      const current = target.kind === "component" && target.scenes === path;
      return { path, current, scenes: current ? scenes.map((s) => ({ name: s.name, description: s.description ?? "", active: s.name === active })) : [] };
    });
  });
  none = computed(() => this.state.sceneFiles().length === 0);
}

/** The picked template node, its owning component, and that component's live signal values. */
export class Inspector {
  static meta = {
    selector: "app-inspector",
    host: { class: "block" },
    imports: [UiBadge, UiSeparator],
    template: html`
      <div class="flex flex-col gap-3 p-3 text-sm">
        @if (node().show) {
          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Template node</h3>
            <div class="flex items-center gap-2">
              <span class="font-mono">{{ node().tag }}</span>
              <span uiBadge variant="secondary">{{ node().rendered }}</span>
            </div>
            <div class="text-xs text-muted-foreground">in {{ node().owner }}</div>
            <div class="break-all font-mono text-xs">{{ node().where }}</div>
            <pre class="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">{{ node().opening }}</pre>
          </section>
          <div uiSeparator></div>
        }
        @if (comp().show) {
          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ comp().name }}</h3>
            <div class="text-xs text-muted-foreground">{{ comp().selector }}</div>
            <h4 class="mt-2 text-xs font-medium">Inputs</h4>
            @for (s of comp().inputs; track s.id) {
              <div class="flex items-baseline justify-between gap-3">
                <span class="font-mono">{{ s.name }}</span>
                <span class="truncate font-mono text-xs">{{ s.value }}</span>
              </div>
            }
            <h4 class="mt-2 text-xs font-medium">Signals</h4>
            @for (s of comp().signals; track s.id) {
              <div class="flex items-baseline justify-between gap-3">
                <span class="font-mono">{{ s.name }} <span class="text-xs text-muted-foreground">{{ s.kind }}</span></span>
                <span class="truncate font-mono text-xs">{{ s.value }}</span>
              </div>
            }
          </section>
        }
        @if (hint()) {
          <p class="text-muted-foreground">Click an element on the canvas, or a component in the tree.</p>
        }
      </div>
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
      where: !s ? "locating…" : "error" in s ? s.error : `${s.file}:${s.from.line}:${s.from.col}`,
      opening: s && !("error" in s) ? s.openingTag : "",
    };
  });
  comp = computed(() => {
    const c = this.state.component();
    if (!c) return { show: false, name: "", selector: "", inputs: [], signals: [] };
    const row = (s: (typeof c.signals)[number]) => ({ id: s.id, name: s.name, kind: s.kind, value: s.value.s });
    return { show: true, name: c.name, selector: c.selector, inputs: c.inputs.map(row), signals: c.signals.map(row) };
  });
  hint = computed(() => !this.node().show && !this.comp().show);
}

/** Language-service diagnostics, with how many are shown on the canvas. */
export class Problems {
  static meta = {
    selector: "app-problems",
    host: { class: "block" },
    imports: [UiBadge, UiButton, UiTooltip],
    template: html`
      <div class="flex flex-col gap-2 p-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">{{ summary() }}</span>
          <button uiButton variant="outline" size="sm" uiTooltip="Run the language service again" (click)="state.refreshDiagnostics()">Refresh</button>
        </div>
        @for (e of configErrors(); track e) {
          <p class="rounded-md border border-destructive/50 p-2 text-destructive">{{ e }}</p>
        }
        @for (d of items(); track d.id) {
          <div class="flex flex-col gap-0.5 rounded-md border p-2">
            <div class="flex items-center gap-2">
              <span uiBadge [variant]="d.variant">{{ d.severity }}</span>
              <span class="font-mono text-xs">{{ d.rule }}</span>
            </div>
            <span>{{ d.message }}</span>
            <span class="font-mono text-xs text-muted-foreground">{{ d.where }}</span>
          </div>
        }
      </div>
    `,
  };
  state = inject(DesignerState);
  configErrors = computed(() => this.state.analysis()?.configErrors ?? []);
  items = computed(() =>
    (this.state.analysis()?.diagnostics ?? []).map((d) => ({
      id: d.id,
      severity: d.severity,
      variant: (d.severity === "error" ? "destructive" : "secondary") as BadgeVariant,
      rule: d.rule,
      message: d.message,
      where: `${d.file}:${d.line}:${d.column}`,
    })),
  );
  summary = computed(() => {
    if (!this.state.analysis()) return "Analyzing…";
    const total = this.items().length;
    return `${total} problem${total === 1 ? "" : "s"}, ${this.state.placement().placed} shown on the canvas`;
  });
}

const KIND: Record<string, { label: string; variant: BadgeVariant }> = {
  patch: { label: "patch", variant: "secondary" },
  view: { label: "view swap", variant: "default" },
  resetup: { label: "re-setup", variant: "destructive" },
};

/** One row per hot update, with what it did to each changed class: patch (state kept), view swap (template replaced) or re-setup (instance rebuilt). */
export class HmrTimeline {
  static meta = {
    selector: "app-hmr-timeline",
    host: { class: "block" },
    imports: [UiBadge],
    template: html`
      <ol class="flex flex-col gap-2 p-2 text-sm">
        @for (entry of entries(); track entry.seq) {
          <li class="flex flex-col gap-1 rounded-md border p-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>#{{ entry.seq }} {{ entry.status }}</span>
              <span>{{ entry.time }}</span>
            </div>
            @for (c of entry.changes; track c.name) {
              <div class="flex items-center gap-2">
                <span uiBadge [variant]="c.variant">{{ c.label }}</span>
                <span class="font-mono">{{ c.name }}</span>
              </div>
            }
            <span class="text-xs text-muted-foreground">{{ entry.modules }}</span>
            @for (e of entry.errors; track e) {
              <span class="text-destructive">{{ e }}</span>
            }
          </li>
        }
        @if (none()) {
          <p class="p-2 text-muted-foreground">Edit a source file and the hot updates appear here.</p>
        }
      </ol>
    `,
  };
  state = inject(DesignerState);
  entries = computed(() =>
    [...this.state.hmr()].reverse().map((e) => ({
      seq: e.seq,
      status: e.status,
      time: `${(e.at / 1000).toFixed(1)}s`,
      modules: e.modules.join(", "),
      errors: e.errors,
      changes: e.changes.map((c) => ({ name: c.name, label: KIND[c.kind]?.label ?? c.kind, variant: KIND[c.kind]?.variant ?? "outline" })),
    })),
  );
  none = computed(() => this.entries().length === 0);
}
