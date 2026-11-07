// Refactors from the canvas (TASK-56.24): Rename component and Find uses. Both read and write the project's source through the
// backend (`/api/refactor/uses`, and the `renameComponent` op of `/api/edit/apply`); the Designer keeps no model. A rename is one
// undo step over every file it touches. Extract with props lives in the Extract dialog (dialogs.ts).
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import type { FindUsesResult, Use } from "../../../src/server/edit/refactor.js";
import { UiButton } from "../components/ui/button.js";
import { UiDialog } from "../components/ui/dialog.js";
import { ChromeState, type DialogName } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import "./tokens.css";

const within = <T>(p: Promise<T>, ms = 2000): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

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

const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

const KIND_TEXT: Record<Use["kind"], string> = {
  declaration: "declared",
  import: "import",
  export: "export",
  imports: "imports list",
  reference: "code",
  template: "template",
  "class-attr": "class",
  "class-binding": "[class.x]",
  "host-binding": "host",
  css: "css",
};

export class RefactorDialogs {
  static meta = {
    selector: "app-refactor-dialogs",
    imports: [UiButton, UiDialog],
    template: html`
      <ui-dialog [(open)]="rename" heading="Rename component" description="Renames the class everywhere it is declared, imported or used, as one undo step." contentClass="dlg">
        <div class="form-row"><span>Component</span><span class="mono truncate" data-part="rename-from">{{ className() }}</span></div>
        <label class="form-row"><span>New name</span>
          <input class="fld mono" placeholder="ProductCard" aria-label="New component name" data-part="rename-to" [value]="renameTo()" (input)="renameTo.set($event.currentTarget.value)" />
        </label>
        <label class="form-row"><span>Selector</span>
          <span class="flex items-center gap-2"><input type="checkbox" data-part="rename-selector-on" [checked]="renameSelectorOn()" [disabled]="!canRenameSelector()" (change)="renameSelectorOn.set($event.currentTarget.checked)" />Also rename it ({{ oldSelector() }})</span>
        </label>
        @if (renameSelectorShown()) {
          <label class="form-row"><span>New selector</span>
            <input class="fld mono" aria-label="New selector" data-part="rename-selector" [value]="renameSelector()" (input)="renameSelector.set($event.currentTarget.value)" />
          </label>
        }
        <div class="form-row"><span>Touches</span><span data-part="rename-touches">{{ touches() }}</span></div>
        @if (renameWhy()) {
          <p class="callout warn" role="status" data-part="rename-why">{{ renameWhy() }}</p>
        }
        @if (renameError()) {
          <p class="callout err" role="alert" data-part="rename-error">{{ renameError() }}</p>
        }
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Cancel</button>
          <button uiButton size="sm" class="btn" data-part="rename-submit" [disabled]="!canRename()" (click)="runRename()">Rename</button>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="findUses" heading="Find uses" description="Where a component or a CSS class is used in the project." contentClass="dlg">
        <div class="form-row"><span>Find</span>
          <span class="flex items-center gap-2">
            <select class="fld" aria-label="What to find" data-part="uses-kind" [value]="usesKind()" (change)="setUsesKind($event.currentTarget.value)">
              <option value="component">Component</option>
              <option value="class">CSS class</option>
            </select>
            <input class="fld mono" aria-label="Name" data-part="uses-name" [value]="usesName()" (input)="usesName.set($event.currentTarget.value)" />
            <button uiButton variant="outline" size="sm" class="btn" data-part="uses-search" (click)="searchUses()">Find</button>
          </span>
        </div>
        @if (usesError()) {
          <p class="callout err" role="alert" data-part="uses-error">{{ usesError() }}</p>
        }
        @if (usesNote()) {
          <p class="pad dim" data-part="uses-note">{{ usesNote() }}</p>
        }
        <div class="uses-list" data-part="uses-list">
          @for (u of usesRows(); track u.key) {
            <button class="tok-use" data-part="use" [attr.data-kind]="u.kind" [attr.title]="u.title" (click)="jump(u.index)">
              <span class="chip">{{ u.kindText }}</span>
              <span class="mono truncate">{{ u.text }}</span>
              <span class="dim truncate tok-at">{{ u.at }}</span>
            </button>
          }
        </div>
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="close()">Close</button>
        </div>
      </ui-dialog>
    `,
  };

  chrome = inject(ChromeState);
  state = inject(DesignerState);
  edit = inject(EditState);

  rename = dialogOpen(this.chrome, "rename");
  findUses = dialogOpen(this.chrome, "find-uses");

  /** The component that owns the selected element (the class the dialogs act on). */
  className = computed(() => this.state.component()?.name ?? "");
  #file = computed(() => (this.state.component()?.source?.path ?? "").replace(/^\//, ""));

  // --- rename --------------------------------------------------------------------------------------------------------------

  renameTo = signal("");
  renameSelectorOn = signal(false);
  renameSelector = signal("");
  renameError = signal("");
  /** What a rename would touch, read from the same index Find uses reads. */
  #current = signal<Use[] | null>(null);
  #selectorNow = signal<string | null>(null);

  #prepare = effect(() => {
    if (!this.rename()) return;
    const name = this.className();
    const file = this.#file();
    untracked(() => {
      this.renameError.set("");
      this.#current.set(null);
      this.#selectorNow.set(null);
      if (!name) return;
      void this.state
        .api<FindUsesResult>("/api/refactor/uses", { kind: "component", name, ...(file ? { file } : {}) })
        .then((r) => {
          if (!r.ok) return void this.renameError.set(r.error);
          this.#current.set(r.uses);
          this.#selectorNow.set(r.declaration?.selector ?? null);
        })
        .catch((e: unknown) => this.renameError.set(String(e)));
    });
  });

  oldSelector = computed(() => this.#selectorNow() ?? "none");
  canRenameSelector = computed(() => /^(?:[a-zA-Z][\w-]*)?(?:\[[\w-]+\])?$/.test(this.#selectorNow() ?? "."));
  renameSelectorShown = computed(() => this.renameSelectorOn() && this.canRenameSelector());
  #valid = computed(() => /^[A-Za-z_$][\w$]*$/.test(this.renameTo().trim()));
  /** The selector the new name suggests, until the person types one. */
  #suggested = computed(() => {
    const old = this.#selectorNow() ?? "";
    const next = kebab(this.renameTo().trim());
    if (!next || !this.#valid()) return old;
    const attr = /^(.*)\[([\w-]+)\]$/.exec(old);
    const prefix = /^(?:li\[)?([a-z]+)-/.exec(attr ? attr[2]! : old)?.[1] ?? "app";
    const tag = next.startsWith(`${prefix}-`) ? next : `${prefix}-${next}`;
    return attr ? `${attr[1]}[${tag}]` : tag;
  });
  #follow = effect(() => {
    const s = this.#suggested();
    untracked(() => this.renameSelector.set(s));
  });
  touches = computed(() => {
    const uses = this.#current();
    if (!uses) return "Looking…";
    const code = uses.filter((u) => u.kind !== "template");
    const files = new Set(code.map((u) => u.file)).size;
    const templates = uses.length - code.length;
    const base = `${code.length} reference${code.length === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}`;
    return this.renameSelectorShown() ? `${base}, and ${templates} template use${templates === 1 ? "" : "s"} of the selector` : base;
  });
  renameWhy = computed(() => {
    if (!this.className()) return "Select an element of the component on the canvas first.";
    if (this.renameTo().trim() && !this.#valid()) return "Use letters, digits, _ or $ (PascalCase, such as ProductCard).";
    if (this.renameTo().trim() === this.className()) return "That is the name it has.";
    return "";
  });
  canRename = computed(() => !!this.className() && this.#valid() && !this.renameWhy() && this.#current() !== null && !this.edit.busy());

  async runRename(): Promise<void> {
    if (!this.canRename()) return;
    const from = this.className();
    const file = this.#file();
    const selector = this.renameSelectorShown() ? this.renameSelector().trim() : undefined;
    const r = await this.edit.apply({ op: "renameComponent", from, to: this.renameTo().trim(), ...(file ? { file } : {}), ...(selector ? { selector } : {}) });
    if (!r) return;
    if (!r.ok) return void this.renameError.set(r.error);
    this.renameTo.set("");
    this.close();
  }

  // --- find uses -----------------------------------------------------------------------------------------------------------

  usesKind = signal<"component" | "class">("component");
  usesName = signal("");
  usesError = signal("");
  #result = signal<Extract<FindUsesResult, { ok: true }> | null>(null);

  #openUses = effect(() => {
    if (!this.findUses()) return;
    const name = this.className();
    untracked(() => {
      this.usesError.set("");
      this.#result.set(null);
      if (name && !this.usesName()) this.usesName.set(name);
      if (this.usesName()) void this.searchUses();
    });
  });

  setUsesKind(kind: string): void {
    this.usesKind.set(kind === "class" ? "class" : "component");
  }

  async searchUses(): Promise<void> {
    const name = this.usesName().trim();
    if (!name) return;
    this.usesError.set("");
    const kind = this.usesKind();
    const file = kind === "component" && name === this.className() ? this.#file() : "";
    try {
      const r = await this.state.api<FindUsesResult>("/api/refactor/uses", { kind, name, ...(file ? { file } : {}) });
      if (!r.ok) {
        this.#result.set(null);
        return void this.usesError.set(r.error);
      }
      this.#result.set(r);
    } catch (e) {
      this.usesError.set(String(e));
    }
  }

  usesRows = computed(() =>
    (this.#result()?.uses ?? []).map((u, index) => ({
      key: `${u.file}:${u.line}:${u.column}`,
      index,
      kind: u.kind,
      kindText: KIND_TEXT[u.kind],
      text: u.text,
      at: `${u.file}:${u.line}`,
      title: u.raw !== undefined ? `${u.file}:${u.line}:${u.column}. Select this element on the canvas` : `${u.file}:${u.line}:${u.column}`,
    })),
  );
  usesNote = computed(() => {
    const r = this.#result();
    if (!r) return "";
    if (r.uses.length === 0) return `Nothing in the project uses ${r.name}.`;
    return `${r.uses.length} use${r.uses.length === 1 ? "" : "s"} of ${r.name}${r.declaration ? ` (declared in ${r.declaration.file})` : ""}.`;
  });

  /** Selects the element a template use is on; other uses have no element on the canvas. */
  async jump(index: number): Promise<void> {
    const u = this.#result()?.uses[index];
    if (!u || u.raw === undefined || u.offset === undefined) return;
    const preview = this.state.preview;
    const node = await within(preview.call("nodeAt", { raw: u.raw, offset: u.offset }));
    if (node) await within(preview.call("selectNode", { id: node.id }));
  }

  close(): void {
    this.chrome.dialog.set(null);
  }
}
