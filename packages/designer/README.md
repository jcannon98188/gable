# @gable/designer

The Gable Designer: inspect a running Gable app, mount one component in isolation, and see language-service problems on the
canvas. Private (not published).

```
npm run build -w packages/designer          # agent + backend (tsc) and the shell (vite)
node packages/designer/dist/server/cli.js examples/todomvc      # then open the printed URL in a browser
packages/designer/src-tauri/target/debug/gable-designer.exe examples/todomvc   # the desktop window (cargo build in src-tauri)
```

Parts:

- `src/agent`: the dev-only **Preview agent**, injected into the project's pages by `src/server/vite-plugin.ts`. Reports over
  `postMessage`; dormant unless the Designer framed the page (`src/protocol.ts`: versioned, nonce and origin checked).
- `src/server`: the Node backend (the project's own Vite is spawned with a wrapper config; nothing is written to the project),
  node-to-source mapping (`source.ts`), the language-service run (`analyze-*.ts`), the HTTP API (token and Host checked).
- `shell`: the Designer UI, itself a Gable app built from gable-ui components copied in with the gable-ui CLI.
- `src-tauri`: the thin Rust desktop host (window and process lifetime only).

Scenarios are `*.scenes.ts` files beside a component (see `examples/todomvc/src/components/todo-item.scenes.ts`); the same
files run under `@gable/testing` with `mountScene`.

## Editing (source write-back)

The Edit tab changes the project's own files; the Designer keeps no model of the design (ADR 0001). Every edit is a request to
`/api/edit/apply` (token and Host checked) that the backend turns into a **minimal text patch**; the project's Vite then
hot-updates the canvas and the shell selects the same element again.

- Position authority: `@gable/template-format`'s lossless parser (`parseTemplateTree`: every element, attribute name/value and
  quote has raw offsets). The runtime `pos` is only a handle: a `TargetRef` is `{ raw, start, tag, modulePath }`, the raw template
  text plus the offset of the element's `<`, verified against the parser (a stale handle is refused, never guessed). Templates with
  escapes, and files holding two identical literals, are refused.
- Ops (`src/server/edit/types.ts`): `setText`, `addText`, `setAttr`, `removeAttr`, `setBinding` (prop/attr/class/style/model from a
  signal picker), `addTextBinding`, `insert` (palette: HTML, gable-ui and project components; also imports the class and lists it in
  `imports`), `delete`, `move`, `wrap` (`@if`/`@for`), `setMeta` (selector/id/encapsulation) and `setCss` (one declaration of a rule).
- Read-only: events, refs, i18n, opaque expressions and `{{ }}` interpolations are shown, never rewritten (`readonly` error).
- Formatting: a template that is formatter-clean before the edit is reformatted as a whole with the repo's formatter options
  (`.prettierrc` / `package.json#prettier`), so the result equals formatter output; any other template is touched only where the
  edit is. CRLF files stay CRLF.
- History: each write records a reverse patch (`hunks.ts`, with surrounding context). Undo/redo first try the exact position, then a
  unique match of the context, and otherwise report a `conflict` and write nothing. The backend's file watcher flags history entries
  of files changed outside the Designer (`history` event; the panel shows it).
