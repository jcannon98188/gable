// The drawer's Changes tab (TASK-56.25): the project's uncommitted files, grouped, with each file's diff rendered by gable-ui's
// code block (`language="diff"`), a commit box for the files you tick, and revert for a whole file or one hunk (with Undo).
// Git runs in the backend; nothing here is kept by the Designer (ADR 0001).
import { computed, html, inject, signal } from "@gable/core";
import { GROUP_LABEL, GROUP_ORDER, type ChangeStatus, type ChangedFile } from "../../../src/git.js";
import { UiButton } from "../components/ui/button.js";
import { UiCheckbox } from "../components/ui/checkbox.js";
import { UiCodeBlock } from "../components/ui/code-block.js";
import { UiDialog } from "../components/ui/dialog.js";
import { UiTextarea } from "../components/ui/textarea.js";
import { ChangesState } from "./changes-state.js";
import { DesignerState } from "./designer-state.js";

const STATUS: Record<ChangeStatus, { letter: string; text: string; cls: string }> = {
  modified: { letter: "M", text: "Modified", cls: "warn" },
  added: { letter: "A", text: "Added", cls: "ok" },
  untracked: { letter: "U", text: "New, not yet tracked", cls: "ok" },
  deleted: { letter: "D", text: "Deleted", cls: "err" },
  renamed: { letter: "R", text: "Renamed", cls: "ok" },
  conflicted: { letter: "!", text: "Merge conflict", cls: "err" },
  typechange: { letter: "T", text: "Type changed", cls: "warn" },
};

/** The language the diff's lines are highlighted as, from the file's extension (gable-ui's tokenizer knows a few; others are plain). */
export function languageOf(path: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  return ({ ts: "ts", tsx: "tsx", mts: "ts", js: "js", jsx: "jsx", mjs: "js", json: "json", css: "css", html: "html", htm: "html", sh: "bash" } as Record<string, string>)[ext] ?? "text";
}

export class ChangesPanel {
  static meta = {
    selector: "app-changes-panel",
    host: { class: "flex h-full min-h-0 flex-col" },
    imports: [UiButton, UiCheckbox, UiCodeBlock, UiDialog, UiTextarea],
    template: html`
      <div class="dbar">
        @if (branch()) {
          <span class="chip on mono" data-part="chg-branch">{{ branch() }}</span>
        }
        <span class="dim" data-part="chg-count">{{ summary() }}</span>
        <span class="spacer"></span>
        <button uiButton variant="ghost" size="sm" class="btn sm" data-part="chg-undo" [disabled]="!canUndo() || busy()" (click)="store.undoRevert()">{{ undoText() }}</button>
        <button uiButton variant="ghost" size="sm" class="btn sm" data-part="chg-refresh" (click)="store.refresh()">Refresh</button>
      </div>
      @if (store.error(); as e) {
        <p class="callout err" role="alert" data-part="chg-error">{{ e }}</p>
      }
      @if (store.notice(); as n) {
        <p class="callout info" role="status" data-part="chg-notice">{{ n }}</p>
      }
      @if (store.unavailable(); as u) {
        <div class="empty" data-part="chg-unavailable"><strong>Source control is not available</strong>{{ u }}</div>
      } @else if (none()) {
        <div class="empty" data-part="chg-empty"><strong>{{ emptyTitle() }}</strong>{{ emptyText() }}</div>
      } @else {
        <div class="chg">
          <div class="chg-list">
            <div class="dbar">
              <button class="chip" data-part="chg-all" [attr.aria-pressed]="allPressed()" (click)="toggleAll()">{{ allText() }}</button>
              <span class="dim">{{ chosenText() }}</span>
            </div>
            <div class="chg-files" role="list" aria-label="Changed files" data-part="chg-files">
              @for (g of groups(); track g.group) {
                <div class="sec-h" role="presentation" [attr.data-group]="g.group">{{ g.label }} · {{ g.count }}</div>
                @for (f of g.files; track f.path) {
                  <div class="chg-row" role="listitem" data-part="chg-file" [class.sel]="f.selected" [attr.data-path]="f.path">
                    <ui-checkbox [(value)]="f.chosen" [attr.aria-label]="f.chooseLabel"></ui-checkbox>
                    <button class="chg-name" [attr.aria-current]="f.current" [attr.title]="f.title" (click)="store.select(f.path)">
                      <span class="mono truncate">{{ f.name }}</span>
                      <span class="dim mono truncate">{{ f.dir }}</span>
                    </button>
                    <span class="chip" [class.ok]="f.ok" [class.warn]="f.warn" [class.err]="f.err" [attr.title]="f.statusText">{{ f.letter }}</span>
                    <span class="mono dim chg-counts">{{ f.counts }}</span>
                  </div>
                }
              }
            </div>
            <div class="chg-commit">
              <!-- TODO(gable-ui): there is no field wrapper for a labelled textarea; the label is the aria-label. -->
              <textarea uiTextarea class="fld mono" rows="3" placeholder="Commit message" aria-label="Commit message" data-part="chg-message" [value]="store.message()" (input)="store.message.set($event.currentTarget.value)"></textarea>
              <button uiButton size="sm" class="btn" data-part="chg-commit" [disabled]="!canCommit()" (click)="commit()">{{ commitText() }}</button>
            </div>
          </div>
          <div class="chg-diff" data-part="chg-diff">
            @if (store.selected(); as path) {
              <div class="dbar">
                <span class="chip on mono truncate" data-part="chg-diff-path">{{ path }}</span>
                <span class="dim">{{ diffNote() }}</span>
                <span class="spacer"></span>
                <button uiButton variant="outline" size="sm" class="btn sm" data-part="chg-revert-file" [disabled]="busy() || !canRevertFile()" (click)="askFile()">Revert file</button>
              </div>
              @if (store.diffError(); as e) {
                <p class="callout err" role="alert">{{ e }}</p>
              }
              @for (h of hunks(); track h.index) {
                <div class="chg-hunk" data-part="chg-hunk" [attr.data-hunk]="h.index">
                  <div class="chg-hunk-bar">
                    <span class="mono dim truncate">{{ h.header }}</span>
                    <span class="mono"><span class="diff-add">+{{ h.added }}</span> <span class="diff-del">−{{ h.removed }}</span></span>
                    @if (hunkRevert()) {
                      <button uiButton variant="ghost" size="sm" class="btn sm" data-part="chg-revert-hunk" [attr.aria-label]="h.revertLabel" [disabled]="busy()" (click)="askHunk(h)">Revert</button>
                    }
                  </div>
                  <ui-code-block language="diff" [code]="h.text" [diffLanguage]="lang()" [lineNumbers]="true" [copyable]="false" [label]="h.label"></ui-code-block>
                </div>
              }
              @if (binary()) {
                <p class="pad dim" data-part="chg-binary">A binary file: git has no text diff for it.</p>
              }
              @if (truncated()) {
                <p class="callout warn" data-part="chg-truncated">The diff is long; only the start is shown. Reverting by hunk is off for it, revert the whole file or use git.</p>
              }
            } @else {
              <div class="empty"><strong>Pick a file</strong>Its diff against the last commit appears here.</div>
            }
          </div>
        </div>
      }

      <ui-dialog [(open)]="confirmOpen" [heading]="confirmHeading()" [description]="confirmText()" contentClass="dlg">
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="confirmOpen.set(false)">Cancel</button>
          <button uiButton variant="destructive" size="sm" class="btn" data-part="chg-revert-confirm" (click)="confirmRevert()">Revert</button>
        </div>
      </ui-dialog>
    `,
  };
  store = inject(ChangesState);
  state = inject(DesignerState);

  busy = this.store.busy;
  canUndo = this.store.canUndo;
  branch = computed(() => {
    const s = this.store.status();
    return s ? (s.branch ?? "detached HEAD") : "";
  });
  summary = computed(() => {
    const n = this.store.count();
    return n === 0 ? "No changes" : `${n} changed file${n === 1 ? "" : "s"}`;
  });
  undoText = computed(() => (this.store.canUndo() ? `Undo revert (${this.store.undoLabel()})` : "Undo revert"));
  none = computed(() => this.store.count() === 0);
  emptyTitle = computed(() => (this.store.result() ? "Nothing to commit" : "Reading the changes…"));
  emptyText = computed(() => (this.store.result() ? "The working tree matches the last commit. Edits made in the Designer show up here as they are written." : ""));

  groups = computed(() => {
    const chosen = this.store.chosen();
    const selected = this.store.selected();
    const row = (f: ChangedFile) => {
      const st = STATUS[f.status];
      const cut = f.path.lastIndexOf("/");
      return {
        path: f.path,
        name: f.path.slice(cut + 1),
        dir: cut < 0 ? "" : f.path.slice(0, cut),
        title: f.from ? `${f.from} → ${f.path}` : f.path,
        letter: st.letter,
        statusText: st.text + (f.staged && f.unstaged ? " (partly staged)" : f.staged ? " (staged)" : ""),
        ok: st.cls === "ok",
        warn: st.cls === "warn",
        err: st.cls === "err",
        counts: f.binary ? "binary" : f.added === null ? "" : `+${f.added} −${f.removed}`,
        // `[(value)]` needs something readable and settable: a function with `set` (a checkbox reports through its model).
        chosen: Object.assign(() => chosen.has(f.path), { set: (on: boolean) => this.store.choose(f.path, on) }),
        chooseLabel: `Include ${f.path} in the commit`,
        selected: f.path === selected,
        current: String(f.path === selected),
      };
    };
    return GROUP_ORDER.map((g) => {
      const files = this.store.files().filter((f) => f.group === g);
      return { group: g, label: GROUP_LABEL[g], count: files.length, files: files.map(row) };
    }).filter((g) => g.count > 0);
  });
  allPressed = computed(() => String(this.store.chosen().size > 0 && this.store.chosen().size === this.store.files().filter((f) => f.status !== "conflicted").length));
  allText = computed(() => (this.allPressed() === "true" ? "Choose none" : "Choose all"));
  chosenText = computed(() => `${this.store.chosen().size} chosen`);
  canCommit = computed(() => this.store.chosen().size > 0 && this.store.message().trim().length > 0 && !this.store.busy());
  commitText = computed(() => {
    const n = this.store.chosen().size;
    return n === 0 ? "Commit" : `Commit ${n} file${n === 1 ? "" : "s"}`;
  });

  hunks = computed(() => {
    const d = this.store.diff();
    const path = this.store.selected() ?? "";
    return (d?.hunks ?? []).map((h) => ({ ...h, label: `Diff of ${path}, ${h.header}`, revertLabel: `Revert the change at ${h.header}` }));
  });
  hunkRevert = computed(() => this.store.diff()?.hunkRevert ?? false);
  binary = computed(() => this.store.diff()?.binary ?? false);
  truncated = computed(() => this.store.diff()?.truncated ?? false);
  lang = computed(() => languageOf(this.store.selected() ?? ""));
  diffNote = computed(() => {
    const f = this.store.files().find((x) => x.path === this.store.selected());
    return f ? STATUS[f.status].text : "";
  });
  canRevertFile = computed(() => this.store.files().find((x) => x.path === this.store.selected())?.status !== "conflicted");

  toggleAll(): void {
    this.store.setAll(this.allPressed() !== "true");
  }

  async commit(): Promise<void> {
    await this.store.commit();
  }

  // --- revert ---------------------------------------------------------------------------------------------------------------
  confirmOpen = signal(false);
  #target = signal<{ path: string; index: number | null; header: string } | null>(null);
  confirmHeading = computed(() => {
    const t = this.#target();
    return t ? (t.index === null ? `Revert ${t.path}?` : `Revert one change in ${t.path}?`) : "Revert?";
  });
  confirmText = computed(() => {
    const t = this.#target();
    const f = t ? this.store.files().find((x) => x.path === t.path) : null;
    const gone = f && (f.status === "untracked" || f.status === "added") ? " The new file is deleted." : "";
    return `The working tree goes back to the last commit for ${t?.index === null ? "the whole file" : "this change"}.${gone} Undo revert puts it back while the Designer is open.`;
  });

  askFile(): void {
    const path = this.store.selected();
    if (!path) return;
    this.#target.set({ path, index: null, header: "" });
    this.confirmOpen.set(true);
  }

  askHunk(h: { index: number; header: string }): void {
    const path = this.store.selected();
    if (!path) return;
    this.#target.set({ path, index: h.index, header: h.header });
    this.confirmOpen.set(true);
  }

  async confirmRevert(): Promise<void> {
    const t = this.#target();
    this.confirmOpen.set(false);
    if (!t) return;
    await (t.index === null ? this.store.revertFile(t.path) : this.store.revertHunk(t.path, t.index, t.header));
  }
}
