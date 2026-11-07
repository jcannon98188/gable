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
