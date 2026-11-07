// The Edit tab: text, attributes and bindings of the selected element, the insert palette, structure (move, delete, wrap) and
// undo/redo. Dynamic expressions the Designer cannot edit safely are listed read-only with the reason.
import { computed, html, inject, signal } from "@gable/core";
import { UiBadge } from "../components/ui/badge.js";
import { UiButton } from "../components/ui/button.js";
import { UiSeparator } from "../components/ui/separator.js";
import type { BindingKind, PaletteEntry } from "../../../src/server/edit/types.js";
import { EditState } from "./edit-state.js";

const KINDS: BindingKind[] = ["prop", "attr", "class", "style", "model"];

export class EditPanel {
  static meta = {
    selector: "app-edit-panel",
    host: { class: "block", "(keydown)": "edit.onKey($event)" },
    imports: [UiBadge, UiButton, UiSeparator],
    // TODO(gable-ui): native <select>/<input> below stand in for UiSelect/UiInput with a Field wrapper (not worth a one-off here).
    template: html`
      <div class="flex flex-col gap-3 p-2 text-sm">
        <div class="flex items-center gap-2">
          <button uiButton variant="outline" size="sm" [disabled]="!edit.canUndo()" (click)="edit.undo()">Undo</button>
          <button uiButton variant="outline" size="sm" [disabled]="!edit.canRedo()" (click)="edit.redo()">Redo</button>
          <span class="text-xs text-muted-foreground">{{ historyText() }}</span>
        </div>
        @if (edit.external().length > 0) {
          <p class="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs" role="status">
            Edited outside the Designer: {{ externalText() }}. Undo still works where it can find its place.
          </p>
        }
        @if (edit.notice(); as note) {
          <p class="text-xs" [class.text-destructive]="!note.ok" [class.text-muted-foreground]="note.ok" role="status">{{ note.text }}</p>
        }
        <div uiSeparator></div>

        @if (edit.refused()) {
          <p class="text-muted-foreground">{{ edit.refused() }}</p>
        } @else if (node(); as n) {
          <header class="flex items-center gap-2">
            <strong class="font-mono">&lt;{{ n.tag }}&gt;</strong>
            <span class="truncate text-xs text-muted-foreground">{{ n.file }}:{{ n.line }}</span>
          </header>

          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">Text</h3>
            @for (t of n.text; track t.run) {
              @if (t.editable) {
                <input class="h-8 rounded-md border bg-transparent px-2" aria-label="Text" [value]="t.text" (change)="setText(t.run, $event.currentTarget.value)" />
              } @else {
                <div class="rounded-md border border-dashed px-2 py-1 font-mono text-xs" [attr.title]="t.why">{{ t.text }} <span uiBadge variant="outline">read-only</span></div>
              }
            }
            @if (n.canAddText) {
              <input class="h-8 rounded-md border bg-transparent px-2" placeholder="Add text…" aria-label="Add text" (change)="addText($event.currentTarget.value)" />
            }
            @if (n.contentWhy) {
              <p class="text-xs text-muted-foreground">{{ n.contentWhy }}</p>
            }
          </section>

          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">Attributes</h3>
            @for (a of n.attrs; track a.name) {
              <div class="flex items-center gap-2">
                <span class="w-24 shrink-0 truncate font-mono text-xs" [attr.title]="a.name">{{ a.name }}</span>
                @if (a.editable && a.kind === 'static') {
                  <input class="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2" [attr.aria-label]="a.name" [value]="a.value" (change)="setAttr(a.name, $event.currentTarget.value)" />
                  <button uiButton variant="ghost" size="sm" [attr.aria-label]="a.name" (click)="removeAttr(a.name)">×</button>
                } @else if (a.editable) {
                  <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ a.value }}</span>
                  <button uiButton variant="ghost" size="sm" [attr.aria-label]="a.name" (click)="removeAttr(a.name)">×</button>
                } @else {
                  <span class="min-w-0 flex-1 truncate rounded-md border border-dashed px-2 py-1 font-mono text-xs" [attr.title]="a.why">{{ a.value }}</span>
                  <span uiBadge variant="outline">read-only</span>
                }
              </div>
            }
            <div class="flex items-center gap-2">
              <input class="h-8 w-24 rounded-md border bg-transparent px-2" placeholder="name…" aria-label="name" [value]="newName()" (input)="newName.set($event.currentTarget.value)" />
              <input class="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2" placeholder="value…" aria-label="value" [value]="newValue()" (input)="newValue.set($event.currentTarget.value)" />
              <button uiButton variant="outline" size="sm" [disabled]="newName() === ''" (click)="addAttr()">Add</button>
            </div>
          </section>

          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">Bind to a signal</h3>
            @if (edit.readable().length === 0) {
              <p class="text-xs text-muted-foreground">The owning component has no signals to bind to.</p>
            } @else {
              <div class="flex items-center gap-2">
                <select class="h-8 rounded-md border bg-transparent px-1" aria-label="Binding kind" (change)="kind.set($event.currentTarget.value)">
                  @for (k of kinds; track k) {
                    <option [value]="k" [selected]="k === kind()">{{ k }}</option>
                  }
                </select>
                <input class="h-8 w-24 rounded-md border bg-transparent px-2" placeholder="name…" aria-label="name" [value]="bindName()" (input)="bindName.set($event.currentTarget.value)" />
              </div>
              <div class="flex items-center gap-2">
                <select class="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-1" aria-label="Signal" (change)="signalName.set($event.currentTarget.value)">
                  <option value="">Pick a signal…</option>
                  @for (s of pickable(); track s) {
                    <option [value]="s" [selected]="s === signalName()">{{ s }}</option>
                  }
                </select>
                <button uiButton variant="outline" size="sm" [disabled]="!canBind()" (click)="bind()">Bind</button>
              </div>
              <button uiButton variant="ghost" size="sm" [disabled]="signalName() === ''" (click)="addTextBinding()">Add as text</button>
            }
          </section>

          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">Structure</h3>
            <div class="flex flex-wrap items-center gap-2">
              <button uiButton variant="outline" size="sm" [disabled]="!n.prev" (click)="moveUp()">Move up</button>
              <button uiButton variant="outline" size="sm" [disabled]="!n.next" (click)="moveDown()">Move down</button>
              <button uiButton variant="outline" size="sm" (click)="remove()">Delete</button>
            </div>
            <div class="flex items-center gap-2">
              <select class="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-1" aria-label="Condition signal" (change)="condName.set($event.currentTarget.value)">
                <option value="">Condition…</option>
                @for (s of edit.readable(); track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
              <button uiButton variant="outline" size="sm" [disabled]="condName() === ''" (click)="wrapIf()">Wrap in &#64;if</button>
            </div>
            <div class="flex items-center gap-2">
              <select class="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-1" aria-label="List signal" (change)="listName.set($event.currentTarget.value)">
                <option value="">List…</option>
                @for (s of edit.readable(); track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
              <button uiButton variant="outline" size="sm" [disabled]="listName() === ''" (click)="wrapFor()">Wrap in &#64;for</button>
            </div>
          </section>

          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">Insert</h3>
            <div class="flex items-center gap-2">
              <select class="h-8 rounded-md border bg-transparent px-1" aria-label="Where" (change)="where.set($event.currentTarget.value)">
                <option value="last">Inside, at the end</option>
                <option value="first">Inside, at the start</option>
                <option value="after">After</option>
                <option value="before">Before</option>
              </select>
            </div>
            @for (g of groups(); track g.title) {
              <h4 class="mt-1 text-xs text-muted-foreground">{{ g.title }}</h4>
              <div class="flex flex-wrap gap-1">
                @for (p of g.entries; track p.name) {
                  <button uiButton variant="outline" size="sm" [attr.title]="p.snippet" (click)="insert(p.name, p.group)">{{ p.name }}</button>
                }
              </div>
            }
          </section>
        } @else {
          <p class="text-muted-foreground">Select an element on the canvas to edit it.</p>
        }
      </div>
    `,
  };
  edit = inject(EditState);
  kinds = KINDS;

  node = this.edit.node;
  newName = signal("");
  newValue = signal("");
  kind = signal<string>("prop");
  bindName = signal("");
  signalName = signal("");
  condName = signal("");
  listName = signal("");
  where = signal("last");

  historyText = computed(() => {
    const h = this.edit.history();
    return h.undo.length === 0 ? "" : `${h.undo.length} edit${h.undo.length === 1 ? "" : "s"}: ${h.undo[h.undo.length - 1]!.label}`;
  });
  externalText = computed(() => this.edit.external().join(", "));
  /** Two-way models need a writable signal; the rest read any. */
  pickable = computed(() => (this.kind() === "model" ? this.edit.writable() : this.edit.readable()));
  canBind = computed(() => this.signalName() !== "" && this.bindName() !== "");
  groups = computed(() => {
    const by = new Map<string, PaletteEntry[]>();
    for (const p of this.edit.palette()) by.set(p.group, [...(by.get(p.group) ?? []), p]);
    const titles: Record<string, string> = { html: "HTML", "gable-ui": "gable-ui", project: "This project" };
    return [...by].map(([group, entries]) => ({ title: titles[group] ?? group, entries }));
  });

  // Handlers. Names are looked up in the current model and palette, so the template only passes plain values.
  setText(run: number, text: string) {
    void this.edit.edit((target) => ({ op: "setText", target, run, text }));
  }
  addText(text: string) {
    if (text.trim()) void this.edit.edit((target) => ({ op: "addText", target, text }));
  }
  setAttr(name: string, value: string) {
    void this.edit.edit((target) => ({ op: "setAttr", target, name, value }));
  }
  removeAttr(name: string) {
    void this.edit.edit((target) => ({ op: "removeAttr", target, name }));
  }
  addAttr() {
    const name = this.newName().trim();
    const value = this.newValue();
    this.newName.set("");
    this.newValue.set("");
    void this.edit.edit((target) => ({ op: "setAttr", target, name, value }));
  }
  bind() {
    const kind = this.kind() as BindingKind;
    const read = this.signalName() + "()";
    void this.edit.edit((target) => ({ op: "setBinding", target, kind, name: this.bindName().trim(), expr: read }));
  }
  addTextBinding() {
    const expr = this.signalName() + "()";
    void this.edit.edit((target) => ({ op: "addTextBinding", target, expr }));
  }
  remove() {
    void this.edit.edit((target) => ({ op: "delete", target }));
  }
  moveUp() {
    const prev = this.node()?.prev;
    if (prev) void this.edit.edit((target) => ({ op: "move", target, to: { ...target, start: prev.start, tag: prev.tag }, where: "before" }));
  }
  moveDown() {
    const next = this.node()?.next;
    if (next) void this.edit.edit((target) => ({ op: "move", target, to: { ...target, start: next.start, tag: next.tag }, where: "after" }));
  }
  wrapIf() {
    const cond = this.condName() + "()";
    void this.edit.edit((target) => ({ op: "wrap", target, with: { kind: "if", cond } }));
  }
  wrapFor() {
    const source = this.listName() + "()";
    void this.edit.edit((target) => ({ op: "wrap", target, with: { kind: "for", item: "item", source, track: "item" } }));
  }
  insert(name: string, group: string) {
    const entry = this.edit.palette().find((p) => p.name === name && p.group === group);
    if (!entry) return;
    const where = this.where() as "before" | "after" | "first" | "last";
    void this.edit.edit((target) => ({ op: "insert", target, where, snippet: entry.snippet, component: entry.component }));
  }
}
