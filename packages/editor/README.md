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
