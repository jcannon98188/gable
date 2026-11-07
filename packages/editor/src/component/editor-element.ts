import { computed, effect, html, input, model, signal, untracked, viewChild } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { UiToggle } from "@gable/ui";
import type * as Y from "yjs";
import { GableEditor } from "../editor.js";
import { corePlugin } from "../core-plugin.js";
import { collabPlugin } from "../yjs/collab-plugin.js";
import { formattingPlugins, historyPlugin } from "../plugins/formatting.js";
import type { EditorPlugin, ToolbarItem } from "../plugin.js";
import { watchToolbar, type ToolbarItemState } from "../toolbar-model.js";

export const defaultPlugins: readonly EditorPlugin[] = [corePlugin, ...formattingPlugins, historyPlugin];

const GLYPHS: Record<string, string> = {
  undo: "↶", redo: "↷", bold: "B", italic: "I", underline: "U", strike: "S", code: "</>", link: "🔗",
  heading1: "H1", heading2: "H2", heading3: "H3", blockquote: "❝", codeBlock: "{ }", horizontalRule: "―",
  bulletList: "•", orderedList: "1.", taskList: "☑",
};

/**
 * `<gable-editor [(value)]="html" [plugins]="plugins" [ydoc]="ydoc" [readonly]="false"></gable-editor>`
 *
 * A rich text editor with a keyboard-operable toolbar (arrow keys, Home/End) and a floating bubble toolbar over the
 * selection. `value` is the document as HTML. With `ydoc` the Y.Doc is the source of truth (collaboration is added
 * for you) and `value` is only written out. Without `plugins`, the default formatting set is used.
 */
export class GableEditorElement {
  static meta = {
    selector: "gable-editor",
    imports: [UiToggle],
    template: html`
      <div class="flex flex-col rounded-md border bg-background text-foreground">
        <div
          role="toolbar"
          aria-label="Formatting"
          aria-orientation="horizontal"
          class="flex flex-wrap items-center gap-0.5 border-b p-1"
          (keydown)="onToolbarKey($event)"
        >
          @for (s of rows(); track s.id) {
            <button
              type="button"
              uiToggle
              size="compact"
              [pressed]="s.active"
              [disabled]="!s.enabled"
              [attr.aria-label]="s.label"
              [attr.title]="s.label"
              [attr.data-toolbar-item]="s.id"
              [attr.tabindex]="s.tab"
              (focus)="focusId.set(s.id)"
              (mousedown)="$event.preventDefault()"
              (click)="activate(s)"
            >
              {{ s.glyph }}
            </button>
          }
        </div>
        @if (bubble(); as b) {
          <div
            role="toolbar"
            aria-label="Selection formatting"
            data-bubble
            class="absolute z-10 flex gap-0.5 rounded-md border bg-popover p-1 shadow-md"
            [attr.style]="b.style"
            (mousedown)="$event.preventDefault()"
          >
            @for (s of bubbleRows(); track s.id) {
              <button type="button" uiToggle size="compact" [pressed]="s.active" [disabled]="!s.enabled" [attr.aria-label]="s.label" (click)="activate(s)">
                {{ s.glyph }}
              </button>
            }
          </div>
        }
        <div #content [attr.class]="contentClasses()"></div>
      </div>
    `,
  };

  /** The document as HTML. Two-way. */
  value = model("");
  plugins = input<readonly EditorPlugin[]>(defaultPlugins);
  /** A shared Y.Doc to collaborate through. */
  ydoc = input<Y.Doc | null>(null);
  readonly = input<boolean>(false);
  disabled = input<boolean>(false);
  /** Show the floating toolbar over a text selection. */
  bubbleMenu = input<boolean>(true);
  class = input<string>("");

  /** The underlying editor once mounted, for plugins and apps that need more than the template exposes. */
  editor = signal<GableEditor | null>(null);
  toolbar = signal<ToolbarItemState[]>([]);
  focusId = signal<string>("");
  bubble = signal<{ style: string } | null>(null);
  rows = computed(() => this.toolbar().map((s) => ({ ...s, glyph: GLYPHS[s.id] ?? s.label.slice(0, 2), tab: s.id === this.focusId() ? 0 : -1 })));
  bubbleRows = computed(() => this.rows().filter((s) => ["styles", "insert"].includes(s.group)));
  contentClasses = computed(() => `prose-editor min-h-24 p-3 outline-none [&_.ProseMirror]:min-h-20 [&_.ProseMirror]:outline-none ${this.class()}`);

  private contentEl = viewChild<HTMLElement>("content");
  private mount = (() => {
    effect(() => {
      const el = this.contentEl();
      const plugins = this.plugins();
      const ydoc = this.ydoc();
      if (!el) return;
      untracked(() => this.create(el as HTMLElement, plugins, ydoc));
    });
    effect(() => {
      const editable = !this.readonly() && !this.disabled();
      const ed = this.editor();
      if (ed && ed.editor.isEditable !== editable) ed.editor.setEditable(editable);
    });
    effect(() => {
      const next = this.value();
      const ed = this.editor();
      if (!ed || this.ydoc()) return;
      if (next !== ed.editor.getHTML()) ed.editor.commands.setContent(next, { emitUpdate: false });
    });
    currentScope()?.onDispose(() => this.teardown());
  })();

  private stop: (() => void) | null = null;

  private create(el: HTMLElement, plugins: readonly EditorPlugin[], ydoc: Y.Doc | null): void {
    this.teardown();
    const all = ydoc ? [...plugins.filter((p) => p.name !== "history"), collabPlugin({ ydoc })] : plugins;
    const ed = new GableEditor({
      plugins: all,
      element: el,
      content: ydoc ? undefined : this.value(),
      editable: !this.readonly() && !this.disabled(),
      ydoc: ydoc ?? undefined,
      editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Rich text editor" } },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        if (html !== this.value()) this.value.set(html);
      },
    });
    const stopToolbar = watchToolbar(ed.editor, ed.toolbar, (state) => {
      this.toolbar.set(state);
      if (!this.focusId() && state[0]) this.focusId.set(state[0].id);
    });
    const onSelection = () => this.placeBubble(ed, el);
    ed.editor.on("selectionUpdate", onSelection);
    ed.editor.on("blur", () => this.bubble.set(null));
    this.stop = () => {
      stopToolbar();
      ed.editor.off("selectionUpdate", onSelection);
      ed.destroy();
    };
    this.editor.set(ed);
  }

  private teardown(): void {
    this.stop?.();
    this.stop = null;
    this.editor.set(null);
  }

  private placeBubble(ed: GableEditor, el: HTMLElement): void {
    const { from, to, empty } = ed.editor.state.selection;
    if (!this.bubbleMenu() || empty || !ed.editor.isEditable) return void this.bubble.set(null);
    try {
      const start = ed.editor.view.coordsAtPos(from);
      const box = el.getBoundingClientRect();
      this.bubble.set({ style: `top:${Math.max(0, start.top - box.top - 40)}px;left:${Math.max(0, start.left - box.left)}px` });
    } catch {
      this.bubble.set(null);
    }
    void to;
  }

  activate(s: ToolbarItemState): void {
    const ed = this.editor();
    if (!ed || !s.enabled) return;
    const item: ToolbarItem = s.item;
    if (item.input && item.runWith && !item.isActive?.(ed.editor)) {
      const value = ed.editor.view.dom.ownerDocument.defaultView?.prompt(item.input.label);
      if (value) item.runWith(ed.editor, value);
      return;
    }
    item.run(ed.editor);
  }

  /** Arrow keys, Home and End move between toolbar buttons (the ARIA toolbar pattern). */
  onToolbarKey(event: KeyboardEvent): void {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const bar = event.currentTarget as HTMLElement;
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    if (!buttons.length) return;
    const i = buttons.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next]!.focus();
  }
}
