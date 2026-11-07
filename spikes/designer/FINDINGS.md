# gable-designer spike: findings (THROWAWAY code, findings are the product)

## What was built
- `agent.js`: injected into the preview by `project.vite.mjs` (a wrapper config handed to the **project's own Vite**; nothing is written to the project). Rides on core's existing devtools hook; adds capture-phase click/hover picking and `postMessage` to the shell (`ready`, `tree`, `pick`; shell sends `mode`, `highlight`).
- `server.mjs` + `resolve.mjs`: Node stand-in for the Rust side: spawns the project's Vite, serves `shell/`, resolves a pick to a file range using `findHtmlLiterals` from `@gable/template-format`.
- `shell/`: plain-JS shell page: iframe + component tree + "picked" panel (the real shell would be a Gable app).
- `src-tauri/`: Tauri 2 window that spawns the Node backend and opens the shell. `cdp-check.mjs` drives it over CDP.
- Run: `node server.mjs ../../examples/todomvc` then open http://localhost:5190, or `cd src-tauri && cargo run -- <absolute project dir>`.

## Result
Goals 1-3 verified in a plain browser AND in the real Tauri/WebView2 window (Edg/157): clicking `<input class="new-todo">` in todomvc reports `todo-app.ts` 15:11 to 22:13 (the exact range of the node inside the `html` literal); clicking the `<label>` inside a `@for`-rendered `TodoItem` reports `todo-item.ts` 15:9 to 15:65. After an HMR edit that inserts a line above, the same element re-resolves one line lower with no reload.

## Q: does the runtime template parse retain source positions?
Not before: `Parser` (template.ts) discarded offsets. Adding them was about 6 lines: `ElementNode.pos = {start, openEnd, end, tpl}` set in `parseElement` (offsets into `strings[0]`), dev-gated (`DEV ? result.strings : undefined`) so production nodes are unchanged. Text nodes, `@if/@for/...` blocks, attributes, bindings and `{{ }}` expressions still have NO positions: only elements are mappable today. Attribute/binding/expression ranges need the same treatment (the `ATTR` regex already yields the match index; `parseExpression` takes a substring so expression-relative offsets must be added to a base).
Cost: negligible (one small object per element, once per call site, dev only).

## Q: how does a rendered node get to a file range?
Three hops, all cheap:
1. DOM element to template node: new optional `DevtoolsSink.element(el, node)` called from `buildElementOf` right after `createElement` (dev-gated). `devtools.ts` keeps a WeakMap and exposes `hook.templateSourceOf(node)` (walks up to the nearest mapped element). Projected/nested content is attributed to the template that authored it (e.g. `<li app-todo-item>` belongs to TodoApp), not to the enclosing host; DOM-walk `componentFor` gets that wrong for slots.
2. Template to class to module: `pos.tpl` (the strings array) is matched to a live component's `Class.meta.template.strings`; class to module URL already exists from the Vite accept line (`devtools.source`, via `hmr.register`). `hmr-source.ts` is NOT involved (it only diffs class source text to classify HMR edits).
3. Module + literal text to file range: the shell backend reads the file and finds the `html` literal by **content equality with `strings.raw[0]`** (no holes, so the literal body is exactly `raw[0]`), then adds `start/end`. The literal's file offset never needs to come from the runtime or Vite. Byte-identical duplicate literals are flagged `ambiguous` in resolve.mjs (disambiguate by class/occurrence order; rare).
Why content-match instead of Vite-transformed offsets: Vite serves TS-stripped code plus the appended accept line, so its offsets differ from the file.

## Q: Renderer changes needed?
None for this. The Renderer contract (`createElement(tag, parent)`) carries no template identity, so an instrumenting Renderer wrapper alone cannot map nodes; the identity has to come from core (the new `element` sink call). A wrapper renderer is still useful later (stamping `data-gable-*` for non-DOM targets, muting user events in design mode) but is not needed for the DOM path. For gable.native the same sink call works because it hands over opaque `el` handles.

## Q: WebView2 behaviour
- Tauri 2.12 + Rust 1.99 + VS 18 BuildTools + WebView2 runtime 157 were already present; clean debug `cargo build` 1m27s; no `tauri-cli` needed (plain `cargo run` works with `tauri.conf.json` + `build.rs`).
- Chromium 157 engine, same as dev browsers: cross-origin iframe (shell :5190, preview :5191) + `postMessage` works; Vite HMR websocket works inside the iframe; hash routing fine.
- CDP works for testing: `additional_browser_args("--remote-debugging-port=N")` on the window builder (the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env var is ignored/overridden by wry). Gives an automation path (`cdp-check.mjs`) for shell tests.
- GOTCHA 1: blocking inside Tauri's `setup` closure (my port-wait loop) hung the app (Responding=False). Wait and build the window from a spawned thread.
- GOTCHA 2: the WebView2 data folder is shared per app identifier; a stale instance started with different browser args silently wins (no CDP port). Kill all instances when changing args; give test runs their own `data_directory`.
- GOTCHA 3: Vite binds `localhost` to `::1` only here, so probes of `127.0.0.1:5191` fail. Always use `localhost` (or `--host 127.0.0.1`).
- GOTCHA 4: the shell is loaded over http from the local backend in this spike. The real shell should be a bundled asset with the preview as the only remote content.
- The agent only needs a cross-origin parent, so the same agent runs in browser, Tauri and (later) device-emulation frames.

## Risks / design changes to feed back
- **Elements only.** Text nodes (the most common visual edit), `@if/@for` blocks, attributes and expressions lack positions. Write-back needs them. Recommend `@gable/template-format`'s lossless parser (`parse.ts`, already used for formatting) be the position authority, with runtime `pos` only acting as a node handle (e.g. ordinal/index path in that tree), so two parsers cannot drift. The write-back task should own this.
- **Cooked vs raw offsets.** The runtime parser consumes cooked `strings[0]`; file offsets are raw. They diverge for any backslash/escape in a template; CRLF files also differ (JS normalises CRLF to LF in templates; resolve.mjs maps back). The parser should read `strings.raw[0]`, or write-back must refuse templates containing backslashes. Not hit by todomvc.
- **Dynamic structure.** One template node maps to many DOM elements (`@for`) or none (`@if` false). Pick-to-node works; node-to-elements highlighting needs a node-to-elements registry (not built). Inspector mode needs it.
- **Click interception** is capture-phase `stopPropagation` on the document; listeners on window or pointer-capture libs can still leak events. Muting at the renderer's `listen` in design mode is more robust, and is the one real use for an instrumenting Renderer.
- **Protocol hygiene.** `{__gable:1, type, ...}` over postMessage is unversioned and the agent accepts any origin. Add a version and origin/nonce check before shipping.
- **API surface.** `hook.templateSourceOf` sits on the public devtools hook. Decide whether design tooling gets its own entry point (e.g. `@gable/core/designer`) instead of growing the devtools protocol.
- **Staleness.** The file may change between render and click (HMR in flight): resolve.mjs returns "literal not found"; the shell should retry after the next `hmr` event.
- **Tailwind mode:** `class` attrs are static strings in `ElementNode.attrs`, so class-token ranges are derivable once attribute positions exist; no new runtime concept needed.
- **Pre-existing flake:** `packages/renderer-dom/src/browser.test.ts` fails about 50% of runs on this machine WITHOUT these changes (4/8 on baseline); unrelated.

## Env notes
- The worktree had no `node_modules`: ran `npm install` and `npm run build` (workspace links let examples/todomvc resolve `@gable/*` from the repo root, so no `pack:local` vendor tarballs needed) and `npm i --no-save todomvc-app-css todomvc-common` at the root for the example CSS. None of that is committed.
