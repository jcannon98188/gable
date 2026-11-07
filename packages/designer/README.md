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
