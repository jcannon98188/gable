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

## Device emulation and frames

The canvas shows up to six **Frames**: iframes sized in CSS pixels (preset, custom, or rotated), scaled down to fit the board
(Fit, or 50/75/100%). Each Frame is its own app instance with its own session nonce and its own origin (`localhost` for the
first, `f1.localhost`, `f2.localhost`... for the rest, all loopback), so frames do not share storage and Chromium gives each
its own renderer process. That last part matters for emulation: over CDP, touch, pointer/hover and media features are
process-wide, so two frames on one site could not be emulated differently.

The device bar edits the selected frame (`FrameSet.selected`, `selectedWidth` and `selectedBreakpoint` in
`shell/src/app/frames.ts`; Tailwind mode reads these). Presets (built in, plus ones you save) and the frame layout are kept
per project in the user data directory (`GABLE_DESIGNER_DATA`, else `%APPDATA%` / `~/Library/Application Support` /
`$XDG_DATA_HOME`), not in the project and not in browser storage (the desktop window's origin changes on every launch).
**Sync** repeats clicks, typing, scrolling and Enter/Escape from the frame you use in the others. **Open in browser** opens
the same page of the same dev server in the system browser.

| Emulation | Windows desktop app (CDP) | Elsewhere |
| --- | --- | --- |
| Width, height, rotation | CSS on the iframe | same |
| Device pixel ratio | reported to scripts (`devicePixelRatio`); resolution media queries and image density follow the screen | same, labelled |
| Touch | CDP touch emulation (coarse pointer, no hover, touch points) plus synthetic touch events | synthetic `touchstart/move/end` from mouse events only, labelled |
| Color scheme, reduced motion, user agent | CDP | unsupported, labelled |

CDP is a Windows-only path: the Rust host passes `--remote-debugging-port=<free port>` to WebView2 (`additional_browser_args`;
the environment variable is ignored) and `--cdp-port` to the backend, which is the CDP client (`src/server/cdp.ts`). Set
`GABLE_CDP_PORT=<n>` to choose the port or `GABLE_CDP_PORT=0` to turn it off. The port listens on loopback and gives full control
of the webview to any local process, so it is only enabled in the desktop app. A frame is found as its own `iframe` CDP target
by reading the nonce the agent keeps in the frame's `window.name`.

The driven check (needs a built Designer and Edge/Chromium with a debugging port, or the Tauri window):

```
node packages/designer/e2e/device-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> [--no-cdp] [--shot dir]
```

## Page mode

The default target runs the whole app with its router. The bar above the canvas has a URL field (type a route and press Go),
and the **Routes** tab lists the route config as written in the source, marks the active routes and navigates on click.
**Add route** and **Edit** write the change back to the route config (`src/server/route-config.ts`: a minimal text patch of the
`Route[]` array, found by its type or as the argument of `provideRouter`; the server picks the file, the shell never names
one). Vite's HMR then applies it to the running router.

### Scenarios in both modes

A scene can mock HTTP and name a start URL, and the same file serves component mode, page mode and `@gable/testing`:

```ts
export default {
  component: UserList,
  scenes: {
    Loaded: { http: [{ method: 'GET', url: '/api/users', reply: { body: users } }] },
    'Server error': { http: [{ url: '/api/users', reply: { status: 500 } }] },
    Offline: { http: [{ url: '/api/users', reply: { error: 'network' } }], url: '/users' },
  },
} satisfies ComponentScenes<UserList>;
```

`http` goes through `mockHttp` (`@gable/core/http`), which replaces the `HttpBackend`; unmatched requests answer 404 and warn.
In page mode the picker above the canvas reloads the page with `?__gable_scenario=<file>|<scene>`. The Designer's Vite
plugin injects a module that sets `__GABLE_DESIGNER_HOOK__.rootProviders` (the mocks plus the scene's `providers`), which
`bootstrap` appends after the app's own providers in development. The **HTTP** tab shows the mocks and the request log.
Limits: `inputs` are ignored in page mode, and a scene that needs the router belongs in page mode (component mode mounts
the component alone).
