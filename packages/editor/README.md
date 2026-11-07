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

## Comments

`commentsPlugin({ ydoc, user })` (needs `collabPlugin` on the same Y.Doc) stores threads in the Y.Doc and anchors them with `Y.RelativePosition`, so they follow concurrent edits. `getComments(editor)` gives `start`, `reply`, `resolve`, `reopen`, `remove`, `threads()` and `subscribe`. `<gable-comments [editor]="ed()">` is a ready-made sidebar. Deleting the anchored text orphans a thread; it is kept and shows the quoted text.

## Suggestion mode (track changes)

`suggestionsPlugin({ user })` records the local user's edits as insert, delete and format marks instead of applying them; `getSuggestions(editor)` exposes `setMode`, `list`, `accept`, `reject`, `acceptAll`, `rejectAll`. `<gable-suggestions [editor]="ed()">` is the review panel. The design and its limits (block-joining deletions are refused, one suggestion per mark type per character) are in `docs/adr/0003-editor-suggestions-are-marks-recorded-at-dispatch.md`.

## Getting started

```ts
const ann = { name: "Ann", color: "#be123c" };
const plugins = [...defaultPlugins.filter((p) => p.name !== "history"), tablePlugin, imagePlugin(), commentsPlugin({ ydoc, user: ann }), suggestionsPlugin({ user: ann })];
```

```html
<gable-editor [(tiptap)]="ed" [plugins]="plugins" [ydoc]="ydoc" [awareness]="awareness" [whenSynced]="synced" [user]="ann"></gable-editor>
<gable-comments [editor]="ed()"></gable-comments>
```

With a real server, wrap your provider: `const { ydoc, awareness, synced } = adaptProvider(new WebsocketProvider(url, room, new Y.Doc()))`.

## Writing a plugin

A plugin is `definePlugin({ name, requires, priority, extensions, toolbar, yjs })`: TipTap extensions plus toolbar items plus an optional hook that receives the shared Y.Doc. Look at `plugins/comments.ts` for state that lives next to the document and at `plugins/suggestions.ts` for rewriting transactions. Register an API per editor in a WeakMap and expose a `getX(editor)` function, so UIs can bind to it.

## Demo

`npm run demo -w packages/editor` serves two linked editors in one page (comments, suggestions, tables, images, presence).
