# @gable/editor

Collaborative rich text editor: TipTap/ProseMirror for the editing model, our own Yjs binding for collaboration. Every feature ships as a plugin.

## Plugins

```ts
import { Mark } from "@tiptap/core";
import { GableEditor, corePlugin, definePlugin } from "@gable/editor";

const bold = definePlugin({
  name: "bold",
  requires: ["core"],           // loaded after these; missing/cyclic deps throw PluginError
  priority: 100,                // higher loads earlier among unconstrained plugins
  extensions: [Mark.create({ name: "bold", parseHTML: () => [{ tag: "strong" }], renderHTML: () => ["strong", 0] })],
  toolbar: [{ id: "bold", label: "Bold", run: (e) => e.commands.toggleMark("bold"), isActive: (e) => e.isActive("bold") }],
  yjs: ({ ydoc, editor }) => { /* plugin-owned shared state; return a disposer */ },
});

const ed = new GableEditor({ plugins: [corePlugin, bold], content: "<p>hi</p>" });
```

A plugin contributes TipTap extensions (nodes, marks, commands, keymaps, ProseMirror plugins, input rules), toolbar items, and an optional Yjs hook. `GableEditor` is headless unless `element` is passed.

## Formatting plugins

`basicStylesPlugin` (bold, italic, underline, strike, code), `linkPlugin`, `headingPlugin`, `blockPlugin` (quote, code block, rule, hard break), `listPlugin` (bullet, ordered, task), `historyPlugin` (local undo/redo). `formattingPlugins` bundles all but history. Markdown-style input rules and the usual shortcuts come with the TipTap extensions underneath.

## Gable component

```html
<gable-editor [(value)]="html" [readonly]="false" [plugins]="plugins" [ydoc]="ydoc"></gable-editor>
```

`GableEditorElement` renders a fixed toolbar (ARIA toolbar: arrow keys, Home/End, roving tabindex) and a floating toolbar over the selection. Toolbar items come from plugins; `watchToolbar` / `readToolbar` expose the same view-model to other UIs. With `ydoc`, collaboration is enabled and the Y.Doc is the source of truth.

## Collaboration

`collabPlugin({ ydoc })` binds the document to a `Y.XmlFragment` with our own binding (`YProseMirrorBinding`, no y-prosemirror). Undo/redo are per user. Initialise only after your provider has synced if peers may seed different content, otherwise each peer's seed is merged.
