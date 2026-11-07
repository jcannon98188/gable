import { computed, effect, html, input, model, signal, untracked, viewChild } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { UiIcon, UiToggle } from "@gable/ui";
import type { Editor } from "@tiptap/core";
import type * as Y from "yjs";
import { GableEditor } from "../editor.js";
import { corePlugin } from "../core-plugin.js";
import { collabPlugin } from "../yjs/collab-plugin.js";
import { awarenessPlugin, type CollabUser } from "../yjs/awareness.js";
import type { Awareness } from "y-protocols/awareness";
import { GablePresence } from "./presence.js";
import { formattingPlugins, historyPlugin } from "../plugins/formatting.js";
import type { EditorPlugin, ToolbarItem } from "../plugin.js";
import { installContentStyles } from "../content-styles.js";
import { placeBubble } from "../bubble-position.js";
import { watchToolbar, type ToolbarItemState } from "../toolbar-model.js";

export const defaultPlugins: readonly EditorPlugin[] = [corePlugin, ...formattingPlugins, historyPlugin];

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
    imports: [UiToggle, UiIcon, GablePresence],
    template: html`
      <div class="relative flex flex-col rounded-md border bg-background text-foreground" #frame>
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
              @if (s.icon) {
                <svg [uiIcon]="s.icon" class="size-4"></svg>
              } @else {
                {{ s.label }}
              }
            </button>
          }
          <gable-presence class="ml-auto" [awareness]="awareness()"></gable-presence>
        </div>
        @if (pending(); as p) {
          <form
            [attr.aria-label]="p.label"
            data-input-popover
            class="flex flex-wrap items-center gap-2 border-b bg-muted/40 p-2 text-sm"
            (submit)="applyInput($event)"
            (keydown)="onInputKey($event)"
          >
            <label class="text-xs font-medium" for="gable-editor-input">{{ p.label }}</label>
            <input
              #field
              id="gable-editor-input"
              class="min-w-40 flex-1 rounded border bg-background px-2 py-1"
              [attr.type]="p.type"
              [value]="p.value"
              (input)="setInput($event)"
            />
            <button type="submit" class="rounded border px-2 py-0.5 text-xs">Apply</button>
            @if (p.removeLabel) {
              <button type="button" class="rounded border px-2 py-0.5 text-xs" (click)="removeInput()">{{ p.removeLabel }}</button>
            }
            <button type="button" class="rounded border px-2 py-0.5 text-xs" (click)="cancelInput()">Cancel</button>
          </form>
        }
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
                @if (s.icon) {
                  <svg [uiIcon]="s.icon" class="size-4"></svg>
                } @else {
                  {{ s.label }}
                }
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
  /** With `ydoc`: the provider's awareness. Shows remote cursors and the presence list. */
  awareness = input<Awareness | null>(null);
  /** The local user shown to others. Needed with `awareness`. */
  user = input<CollabUser>({ name: "Anonymous", color: "#6b7280" });
  /** With `ydoc`: resolve when the provider has synced, so peers do not each seed the document. */
  whenSynced = input<Promise<unknown> | null>(null);
  readonly = input<boolean>(false);
  disabled = input<boolean>(false);
  /** Show the floating toolbar over a text selection. */
  bubbleMenu = input<boolean>(true);
  class = input<string>("");

  /** The underlying editor once mounted, for plugins and apps that need more than the template exposes. */
  editor = signal<GableEditor | null>(null);
  /** The TipTap editor itself, written out for bindings such as `[(tiptap)]="ed"` next to `<gable-comments [editor]="ed()">`. */
  tiptap = model<Editor | null>(null);
  toolbar = signal<ToolbarItemState[]>([]);
  focusId = signal<string>("");
  bubble = signal<{ style: string } | null>(null);
  /** The toolbar item that is waiting for a value from the user, shown as an inline popover. */
  pending = signal<{ item: ToolbarItem; label: string; type: string; value: string; removeLabel: string } | null>(null);
  private field = viewChild<HTMLInputElement>("field");
  private focusField = (() => {
    effect(() => {
      const el = this.field();
      if (el && this.pending()) untracked(() => (el as HTMLInputElement).focus());
    });
  })();
  rows = computed(() => this.toolbar().map((s) => ({ ...s, tab: s.id === this.focusId() ? 0 : -1 })));
  bubbleRows = computed(() => this.rows().filter((s) => ["styles", "insert"].includes(s.group)));
  contentClasses = computed(() => `prose-editor min-h-24 p-3 outline-none [&_.ProseMirror]:min-h-20 [&_.ProseMirror]:outline-none ${this.class()}`);

  private contentEl = viewChild<HTMLElement>("content");
  private frameEl = viewChild<HTMLElement>("frame");
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
    installContentStyles(el.ownerDocument);
    const awareness = this.awareness();
    const all = ydoc
      ? [
          ...plugins.filter((p) => p.name !== "history"),
          collabPlugin({ ydoc, whenSynced: this.whenSynced() ?? undefined }),
          ...(awareness ? [awarenessPlugin({ awareness, user: this.user() })] : []),
        ]
      : plugins;
    const ed = new GableEditor({
      plugins: all,
      element: el,
      // With a ydoc, `value` is only the initial content: used if the shared document turns out to be empty.
      content: this.value(),
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
    this.tiptap.set(ed.editor);
  }

  private teardown(): void {
    this.stop?.();
    this.stop = null;
    this.editor.set(null);
    this.tiptap.set(null);
  }

  private placeBubble(ed: GableEditor, el: HTMLElement): void {
    const { from, to, empty } = ed.editor.state.selection;
    const frame = (this.frameEl() as HTMLElement | undefined) ?? el;
    if (!this.bubbleMenu() || empty || !ed.editor.isEditable) return void this.bubble.set(null);
    try {
      const a = ed.editor.view.coordsAtPos(from);
      const b = ed.editor.view.coordsAtPos(to);
      const frameBox = frame.getBoundingClientRect();
      // Flip below when there is no room above *the text area*: the toolbar sits above it and must not be covered.
      const box = el.getBoundingClientRect();
      // The bubble's width is not known until it renders: estimate from the number of buttons (compact buttons are ~32px).
      const size = { width: this.bubbleRows().length * 32 + 8, height: 40 };
      const at = placeBubble(
        { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: a.left, right: b.right },
        box,
        size,
      );
      const top = at.top + (box.top - frameBox.top);
      const left = at.left + (box.left - frameBox.left);
      this.bubble.set({ style: `top:${Math.round(top)}px;left:${Math.round(left)}px` });
    } catch {
      this.bubble.set(null);
    }
  }

  activate(s: ToolbarItemState): void {
    const ed = this.editor();
    if (!ed || !s.enabled) return;
    const item: ToolbarItem = s.item;
    if (item.input && item.runWith) {
      const { input } = item;
      this.pending.set({
        item,
        label: input.label,
        type: input.kind === "url" ? "url" : "text",
        value: input.initial?.(ed.editor) ?? "",
        removeLabel: input.removeLabel && item.isActive?.(ed.editor) ? input.removeLabel : "",
      });
      return;
    }
    item.run(ed.editor);
  }

  setInput(event: Event): void {
    const p = this.pending();
    if (p) this.pending.set({ ...p, value: (event.target as HTMLInputElement).value });
  }

  applyInput(event: Event): void {
    event.preventDefault();
    const p = this.pending();
    const ed = this.editor();
    if (!p || !ed) return;
    const value = p.value.trim();
    this.closeInput();
    if (value) p.item.runWith?.(ed.editor, value);
  }

  removeInput(): void {
    const p = this.pending();
    const ed = this.editor();
    this.closeInput();
    if (p && ed) p.item.run(ed.editor);
  }

  cancelInput(): void {
    this.closeInput();
  }

  onInputKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeInput();
    } else if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
      this.applyInput(event);
    }
  }

  private closeInput(): void {
    this.pending.set(null);
    this.editor()?.editor.commands.focus();
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
