# @gable/editor

A collaborative rich text editor. TipTap and ProseMirror provide the editing model, and a small Yjs binding of our own provides collaboration. Every feature ships as a plugin: a plugin bundles TipTap extensions (nodes, marks, commands, keymaps, input rules), toolbar items and an optional hook for state that lives next to the document in a shared `Y.Doc`.

## Install

```
npm install @gable/editor @gable/core @gable/ui yjs
```

The package exports one entry point. `GableEditor` is headless unless you pass an `element`. `<gable-editor>` is the ready-made Gable component: a toolbar (an ARIA toolbar with arrow-key movement), a floating toolbar over the selection and presence avatars. It is styled with [gable-ui](../gable-ui-cli.md) classes and the gable-ui theme, so an app that does not use Tailwind can draw its own toolbar instead, as the demo below does.

## Plugins, live

The editor below is a real `GableEditor` made from the stock `basicStylesPlugin`, `headingPlugin`, `listPlugin` and `historyPlugin`, plus two plugins written for this page: `highlightPlugin` (a TipTap mark and a toolbar item) and `clearPlugin` (a toolbar command and nothing else). Select text and press the buttons, use the shortcuts, type `# ` or `- ` at the start of a line, then open the document HTML to see what the editor produced. The toolbar is this demo's own component, driven by `watchToolbar`.

```demo editor
The source below is the real demo component.
```

## A plugin

```ts
import { Mark } from "@tiptap/core";
import { GableEditor, corePlugin, definePlugin } from "@gable/editor";

const Highlight = Mark.create({
  name: "highlight",
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: () => ["mark", 0],
});

const highlight = definePlugin({
  name: "highlight",
  requires: ["core"], // loaded after these; a missing or cyclic dependency throws PluginError
  priority: 100, // higher loads earlier among plugins with no ordering constraint
  extensions: [Highlight],
  toolbar: [
    {
      id: "highlight",
      label: "Highlight",
      group: "styles",
      run: (e) => e.chain().focus().toggleMark("highlight").run(),
      isActive: (e) => e.isActive("highlight"),
    },
  ],
});

const ed = new GableEditor({ plugins: [corePlugin, highlight], content: "<p>hi</p>" });
```

`definePlugin` only type-checks the definition. A toolbar item can also ask the user for a value (`input: { kind: "url" | "text", ... }` with `runWith`), which is how the link plugin collects a URL. The optional `yjs` hook receives the shared `Y.Doc` and returns a disposer; the comments and suggestions plugins use it.

## The formatting plugins

`basicStylesPlugin` (bold, italic, underline, strike, code), `linkPlugin`, `headingPlugin`, `blockPlugin` (quote, code block, rule, hard break), `listPlugin` (bullet, ordered, task) and `historyPlugin` (local undo and redo). `formattingPlugins` bundles all of them except history. `tablePlugin` and `imagePlugin()` add tables and images. Markdown-style input rules and the usual shortcuts come with the TipTap extensions.

## The component

```html
<gable-editor [(value)]="html" [readonly]="false" [plugins]="plugins" [ydoc]="ydoc"></gable-editor>
```

Without `plugins` it uses `defaultPlugins`; spread it to extend the default. `value` is the document as HTML. With `ydoc`, collaboration is on and the `Y.Doc` is the source of truth, so `value` is only written out. `[(tiptap)]="ed"` gives you the TipTap `Editor` for the sidebars below. `watchToolbar` and `readToolbar` expose the toolbar view-model, so any UI can render the same items, as the demo above does.

## Collaboration

```ts
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { adaptProvider } from "@gable/editor";

const { ydoc, awareness, synced } = adaptProvider(new WebsocketProvider(url, room, new Y.Doc()));
```

```html
<gable-editor [(tiptap)]="ed" [plugins]="plugins" [ydoc]="ydoc" [awareness]="awareness" [whenSynced]="synced" [user]="ann"></gable-editor>
```

`collabPlugin({ ydoc })` binds the document to a `Y.XmlFragment` with our own binding, `YProseMirrorBinding`, and does not use y-prosemirror. Undo and redo are per user, so leave `historyPlugin` out; the component drops it for you when you pass `ydoc`. If peers may seed different content, start the editor only after your provider has synced, otherwise each peer's seed is merged. `linkPeers(n)` wires several in-memory peers together, which is how the package's own demo runs two editors in one page. This section is code only here, because a live collaboration demo needs a second peer and a provider.

## Comments

`commentsPlugin({ ydoc, user })` needs `collabPlugin` on the same `Y.Doc`. It stores threads in the document and anchors them with `Y.RelativePosition`, so they follow concurrent edits. `getComments(editor)` gives `start`, `reply`, `resolve`, `reopen`, `remove`, `threads()` and `subscribe`, and `<gable-comments [editor]="ed()">` is a ready-made sidebar. Deleting the anchored text orphans a thread; it is kept and shows the quoted text.

## Suggestion mode

`suggestionsPlugin({ user })` records the local user's edits as insert, delete and format marks instead of applying them, like track changes. `getSuggestions(editor)` exposes `setMode`, `list`, `accept`, `reject`, `acceptAll` and `rejectAll`, and `<gable-suggestions [editor]="ed()">` is the review panel. Block-joining deletions are refused and a character carries one suggestion per mark type. The reasoning is in [ADR 0003](../adr/0003-editor-suggestions-are-marks-recorded-at-dispatch.md).

## Everything together

```ts
const ann = { name: "Ann", color: "#be123c" };
const plugins = [
  ...defaultPlugins.filter((p) => p.name !== "history"),
  tablePlugin,
  imagePlugin(),
  commentsPlugin({ ydoc, user: ann }),
  suggestionsPlugin({ user: ann }),
];
```

```html
<gable-editor [(tiptap)]="ed" [plugins]="plugins" [ydoc]="ydoc" [awareness]="awareness" [whenSynced]="synced" [user]="ann"></gable-editor>
<gable-comments [editor]="ed()"></gable-comments>
<gable-suggestions [editor]="ed()"></gable-suggestions>
```

`npm run demo -w packages/editor` in the repository serves two linked editors in one page with comments, suggestions, tables, images and presence.

## Writing your own stateful plugin

Register an API per editor in a `WeakMap` and export a `getX(editor)` function, so UIs can bind to it. Look at `plugins/comments.ts` for state that lives beside the document and at `plugins/suggestions.ts` for rewriting transactions.

Every exported symbol is documented in the API reference, linked below.
