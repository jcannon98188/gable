// The Content tab: text, attributes and bindings of the selected element, visibility and list wrapping, and structure (move,
// delete). Dynamic expressions the Designer cannot edit safely are shown read-only in amber with the reason.
import { computed, html, inject, signal } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { PopoverTrigger, UiPopover } from "../components/ui/popover.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiIcon } from "../lib/ui/icon.js";
import type { BindingKind } from "../../../src/server/edit/types.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";

const KINDS: Array<{ value: string; label: string }> = [
  { value: "text", label: "Text" },
  { value: "prop", label: "Property" },
  { value: "attr", label: "Attribute" },
  { value: "class", label: "Class" },
  { value: "style", label: "Style" },
  { value: "model", label: "Two-way" },
];

export class EditPanel {
  static meta = {
    selector: "app-edit-panel",
    host: { class: "block" },
    imports: [UiButton, UiIcon, UiPopover, PopoverTrigger, UiTooltip],
    template: html`
      <div class="dbar">
        <button uiButton variant="ghost" size="sm" class="btn sm" [disabled]="!edit.canUndo()" (click)="edit.undo()">Undo</button>
        <button uiButton variant="ghost" size="sm" class="btn sm" [disabled]="!edit.canRedo()" (click)="edit.redo()">Redo</button>
        <span class="dim truncate">{{ historyText() }}</span>
      </div>
      @if (edit.external().length > 0) {
        <p class="callout warn" role="status">Edited outside the Designer: {{ externalText() }}. Undo still works where it can find its place.</p>
      }
      @if (edit.notice(); as note) {
        <p class="callout" [class.err]="!note.ok" role="status">{{ note.text }}</p>
      }

      @if (edit.refused()) {
        <div class="callout warn" data-part="read-only">
          <span class="chip warn">Read-only</span>
          <p class="mt-1">{{ edit.refused() }}</p>
          <button uiButton variant="outline" size="sm" class="btn sm mt-2" (click)="chrome.showDrawer('code')">Edit in code</button>
        </div>
      } @else if (node(); as n) {
        <div class="dbar">
          <span class="chip on mono">{{ tagText() }}</span>
          <span class="mono dim truncate">{{ n.file }}:{{ n.line }}</span>
        </div>

        <div class="sec">
          <div class="sec-h">Text</div>
          @for (t of n.text; track t.run) {
            @if (t.editable) {
              <div class="prop"><span class="l">Content</span><input class="fld" aria-label="Text" [value]="t.text" (change)="setText(t.run, $event.currentTarget.value)" /></div>
            } @else {
              <div class="prop" [uiTooltip]="t.why">
                <span class="l">Content</span>
                <span class="fld ro mono truncate" tabindex="0">{{ t.text }}</span>
                <span class="chip warn">read-only</span>
              </div>
            }
          }
          @if (n.canAddText) {
            <div class="prop"><span class="l">Content</span><input class="fld" placeholder="Add text…" aria-label="Add text" (change)="addText($event.currentTarget.value)" /></div>
          }
          @if (n.contentWhy) {
            <p class="callout warn">{{ n.contentWhy }}</p>
          }
        </div>

        <div class="sec">
          <div class="sec-h">Attributes</div>
          @for (a of attrs(); track a.name) {
            <div class="prop">
              <span class="l mono" [attr.title]="a.name">{{ a.name }}</span>
              @if (a.editable && a.kind === 'static') {
                <input class="fld" [attr.aria-label]="a.name" [value]="a.value" (change)="setAttr(a.name, $event.currentTarget.value)" />
                <button class="btn-plain" [attr.aria-label]="a.removeLabel" (click)="removeAttr(a.name)"><svg uiIcon="x" class="ico-sm"></svg></button>
              } @else if (a.editable) {
                <span class="fld ghost mono truncate" [attr.title]="a.value">{{ a.value }}</span>
                <button class="btn-plain" [attr.aria-label]="a.removeLabel" (click)="removeAttr(a.name)"><svg uiIcon="x" class="ico-sm"></svg></button>
              } @else {
                <span class="fld ro mono truncate" [attr.title]="a.why">{{ a.value }}</span>
                <span class="chip warn" [uiTooltip]="a.why" tabindex="0">read-only</span>
              }
            </div>
          }
          <div class="prop">
            <input class="fld mono" style="flex: 0 0 62px" placeholder="name…" aria-label="name" [value]="newName()" (input)="newName.set($event.currentTarget.value)" />
            <input class="fld" placeholder="value…" aria-label="value" [value]="newValue()" (input)="newValue.set($event.currentTarget.value)" />
            <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="newName() === ''" (click)="addAttr()">Add</button>
          </div>
        </div>

        <div class="sec">
          <div class="sec-h">Bind to a signal</div>
          @if (edit.readable().length === 0) {
            <div class="empty">The owning component has no signals to bind to.</div>
          } @else {
            <div class="pad">
              <ui-popover [(open)]="bindOpen" placement="left-start" contentClass="pop">
                <button slot="trigger" popoverTrigger uiButton variant="outline" size="sm" class="btn" data-part="bind"><svg uiIcon="link" class="ico-sm"></svg>Bind…</button>
                <div class="p-2">
                  <label class="fld">
                    <svg uiIcon="search" class="ico-sm dim"></svg>
                    <input class="min-w-0 flex-1 bg-transparent outline-none" placeholder="Find a signal" aria-label="Find a signal" [value]="signalSearch()" (input)="signalSearch.set($event.currentTarget.value)" />
                  </label>
                  <div class="flex gap-1 mt-2">
                    <select class="fld" aria-label="Binding kind" (change)="kind.set($event.currentTarget.value)">
                      @for (k of kinds(); track k.value) {
                        <option [value]="k.value" [selected]="k.selected">{{ k.label }}</option>
                      }
                    </select>
                    @if (needsName()) {
                      <input class="fld mono" placeholder="name…" aria-label="Binding name" [value]="bindName()" (input)="bindName.set($event.currentTarget.value)" />
                    }
                  </div>
                </div>
                <div class="bind-list" role="listbox" aria-label="Signals">
                  @for (s of pickable(); track s.name) {
                    <button class="tr" role="option" [attr.aria-selected]="s.selected" [class.sel]="s.selected" (click)="signalName.set(s.name)">
                      <span class="mono truncate">{{ s.name }}</span>
                      <span class="chip trail">{{ s.kind }}</span>
                    </button>
                  }
                  @if (noPickable()) {
                    <div class="empty">No signal matches.</div>
                  }
                </div>
                <div class="side-foot flex items-center gap-2">
                  <span class="mono truncate flex-1" [attr.title]="currentValue()">{{ currentValue() }}</span>
                  <button uiButton size="sm" class="btn sm" [disabled]="!canBind()" (click)="bind()">Bind</button>
                </div>
              </ui-popover>
            </div>
          }
        </div>

        <div class="sec">
          <div class="sec-h">Visibility</div>
          <div class="prop">
            <select class="fld" aria-label="Condition signal" (change)="condName.set($event.currentTarget.value)">
              <option value="">Condition…</option>
              @for (s of edit.readable(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
            <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="condName() === ''" (click)="wrapIf()">{{ wrapIfText }}</button>
          </div>
          <div class="prop">
            <select class="fld" aria-label="List signal" (change)="listName.set($event.currentTarget.value)">
              <option value="">List…</option>
              @for (s of edit.readable(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
            <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="listName() === ''" (click)="wrapFor()">{{ wrapForText }}</button>
          </div>
        </div>

        <div class="sec">
          <div class="sec-h">Structure</div>
          <div class="pad wrap">
            <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="!n.prev" (click)="moveUp()">Move up</button>
            <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="!n.next" (click)="moveDown()">Move down</button>
            <button uiButton variant="outline" size="sm" class="btn sm" (click)="remove()">Delete</button>
            <button uiButton variant="ghost" size="sm" class="btn sm" (click)="chrome.dialog.set('extract')">Extract to component…</button>
          </div>
        </div>
      } @else {
        <div class="empty"><strong>Nothing selected</strong>Select an element on the canvas to edit it.</div>
      }
    `,
  };
  edit = inject(EditState);
  // Bound rather than written in the template: there an at sign starts a block, and character references are not decoded.
  wrapIfText = "Wrap in @if";
  wrapForText = "Wrap in @for";
  tagText = computed(() => `<${this.edit.node()?.tag ?? ""}>`);
  chrome = inject(ChromeState);
  state = inject(DesignerState);

  node = this.edit.node;
  newName = signal("");
  newValue = signal("");
  kind = signal<string>("text");
  bindName = signal("");
  signalName = signal("");
  signalSearch = signal("");
  bindOpen = signal(false);
  condName = signal("");
  listName = signal("");

  kinds = computed(() => KINDS.map((k) => ({ ...k, selected: k.value === this.kind() })));
  needsName = computed(() => this.kind() !== "text");
  historyText = computed(() => {
    const h = this.edit.history();
    return h.undo.length === 0 ? "" : `${h.undo.length} edit${h.undo.length === 1 ? "" : "s"}: ${h.undo[h.undo.length - 1]!.label}`;
  });
  externalText = computed(() => this.edit.external().join(", "));
  /** Two-way models need a writable signal; the rest read any. */
  pickable = computed(() => {
    const q = this.signalSearch().trim().toLowerCase();
    const names = this.kind() === "model" ? this.edit.writable() : this.edit.readable();
    const info = this.edit.signals();
    return names
      .filter((n) => !q || n.toLowerCase().includes(q))
      .map((name) => ({ name, kind: info.find((s) => s.name === name)?.kind ?? "", selected: name === this.signalName() }));
  });
  noPickable = computed(() => this.pickable().length === 0);
  currentValue = computed(() => {
    const name = this.signalName();
    if (!name) return "Pick a signal";
    const s = this.state.component()?.signals.find((x) => x.name === name);
    return s ? `${name}: ${s.value.s}` : name;
  });
  canBind = computed(() => this.signalName() !== "" && (!this.needsName() || this.bindName().trim() !== ""));

  // Handlers. Names are looked up in the current model, so the template only passes plain values.
  setText(run: number, text: string) {
    void this.edit.edit((target) => ({ op: "setText", target, run, text }));
  }
  addText(text: string) {
    if (text.trim()) void this.edit.edit((target) => ({ op: "addText", target, text }));
  }
  setAttr(name: string, value: string) {
    void this.edit.edit((target) => ({ op: "setAttr", target, name, value }));
  }
  attrs = computed(() => (this.edit.node()?.attrs ?? []).map((a) => ({ ...a, removeLabel: `Remove ${a.name}` })));

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
    const expr = this.signalName() + "()";
    const kind = this.kind();
    this.bindOpen.set(false);
    if (kind === "text") return void this.edit.edit((target) => ({ op: "addTextBinding", target, expr }));
    const name = this.bindName().trim();
    void this.edit.edit((target) => ({ op: "setBinding", target, kind: kind as BindingKind, name, expr }));
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
}
