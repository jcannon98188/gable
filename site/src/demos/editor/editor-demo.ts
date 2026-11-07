import { computed, effect, html, signal, untracked, viewChild } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { Mark, type Editor } from "@tiptap/core";
import { GableEditor, basicStylesPlugin, corePlugin, definePlugin, headingPlugin, historyPlugin, listPlugin, watchToolbar, type ToolbarItemState } from "@gable/editor";
import { editorStyles } from "./editor-style.js";

const Highlight = Mark.create({
  name: "highlight",
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: () => ["mark", 0],
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleMark("highlight") };
  },
});

/** Our own plugin: one TipTap mark plus a toolbar item that toggles it. Plugins never touch the DOM. */
export const highlightPlugin = definePlugin({
  name: "highlight",
  requires: ["core"],
  extensions: [Highlight],
  toolbar: [
    {
      id: "highlight",
      label: "Highlight",
      group: "styles",
      order: 15,
      run: (e) => e.chain().focus().toggleMark("highlight").run(),
      isActive: (e) => e.isActive("highlight"),
    },
  ],
});

/** A plugin with no extensions at all: just a toolbar command built from existing TipTap commands. */
export const clearPlugin = definePlugin({
  name: "clearFormatting",
  requires: ["core"],
  toolbar: [
    {
      id: "clear",
      label: "Clear formatting",
      group: "history",
      order: 90,
      run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
      isEnabled: (e) => !e.state.selection.empty,
    },
  ],
});

/** The plugin list the demo hands to `GableEditor`. Order does not matter: `requires` decides what loads first. */
export const demoPlugins = [corePlugin, basicStylesPlugin, headingPlugin, listPlugin, highlightPlugin, clearPlugin, historyPlugin];

const SHORT: Record<string, string> = {
  bold: "B",
  italic: "I",
  underline: "U",
  strike: "S",
  code: "</>",
  heading1: "H1",
  heading2: "H2",
  heading3: "H3",
  bulletList: "List",
  orderedList: "1.",
  taskList: "Tasks",
  highlight: "Mark",
  clear: "Clear",
  undo: "Undo",
  redo: "Redo",
};

const START =
  "<h2>Gable editor</h2><p>Select some of this text and use the toolbar, or try <strong>Ctrl+B</strong>, <em>Ctrl+I</em> and <mark>Ctrl+Shift+H</mark>. Typing <code># </code> or <code>- </code> at the start of a line starts a heading or a list.</p><ul><li>Plugins add the marks and nodes.</li><li>Plugins add the toolbar buttons too.</li></ul>";

/**
 * A real `@gable/editor` editor: `GableEditor` assembled from plugins (the stock formatting plugins plus two written
 * here), a toolbar drawn by this component from `watchToolbar`, and the document read back as HTML. The ready-made
 * `<gable-editor>` element draws its own toolbar; this demo builds one by hand to show that the toolbar model is
 * UI-agnostic.
 */
export class EditorDemo {
  static meta = {
    selector: "editor-demo",
    styles: editorStyles,
    encapsulation: "none" as const,
    template: html`
<div class="ed-panel">
  <div class="ed-bar" role="group" aria-label="Formatting">
    @for (b of buttons(); track b.id) {
      <button type="button" class="ed-btn" [attr.aria-pressed]="b.pressed" [attr.aria-label]="b.label" [attr.title]="b.label" [disabled]="!b.enabled" (mousedown)="keepFocus($event)" (click)="run(b.id)">{{ b.text }}</button>
    }
  </div>
  <div class="ed-surface" #surface></div>
  <div class="ed-row">
    <label class="ed-check"><input type="checkbox" [checked]="locked()" (change)="toggleLocked()" /> Read only</label>
    <span class="ed-stat" aria-live="polite">{{ words() }} words, {{ chars() }} characters</span>
  </div>
  <details class="ed-det">
    <summary>Document HTML</summary>
    <pre class="ed-pre">{{ doc() }}</pre>
  </details>
</div>
    `,
  };

  private surface = viewChild<HTMLElement>("surface");
  private gable = signal<GableEditor | null>(null);
  private items = signal<ToolbarItemState[]>([]);
  locked = signal(false);
  doc = signal("");
  text = signal("");

  buttons = computed(() =>
    this.items().map((s) => ({ id: s.id, label: s.label, text: SHORT[s.id] ?? s.label, pressed: s.active ? "true" : "false", enabled: s.enabled })),
  );
  words = computed(() => (this.text().trim() ? this.text().trim().split(/\s+/).length : 0));
  chars = computed(() => this.text().length);

  private stop: (() => void) | null = null;

  private mount = (() => {
    effect(() => {
      const el = this.surface();
      if (!el) return;
      untracked(() => this.create(el as HTMLElement));
    });
    effect(() => {
      const ed = this.gable();
      const editable = !this.locked();
      if (ed && ed.editor.isEditable !== editable) ed.editor.setEditable(editable);
    });
    currentScope()?.onDispose(() => this.teardown());
  })();

  private create(el: HTMLElement): void {
    this.teardown();
    const ed = new GableEditor({
      plugins: demoPlugins,
      element: el,
      content: START,
      editable: !this.locked(),
      editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Demo editor" } },
      onUpdate: ({ editor }) => this.read(editor),
    });
    const stopToolbar = watchToolbar(ed.editor, ed.toolbar, (state) => this.items.set(state));
    this.stop = () => {
      stopToolbar();
      ed.destroy();
    };
    this.read(ed.editor);
    this.gable.set(ed);
  }

  private read(editor: Editor): void {
    this.doc.set(editor.getHTML());
    this.text.set(editor.getText());
  }

  private teardown(): void {
    this.stop?.();
    this.stop = null;
    this.gable.set(null);
    this.items.set([]);
  }

  /** Keeps the selection in the document when a toolbar button is pressed with the mouse. */
  keepFocus(event: Event): void {
    event.preventDefault();
  }

  run(id: string): void {
    const ed = this.gable();
    const item = ed?.toolbar.find((i) => i.id === id);
    if (ed && item) item.run(ed.editor);
  }

  toggleLocked(): void {
    this.locked.update((v) => !v);
  }
}
