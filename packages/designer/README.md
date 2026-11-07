# @gable/designer

The Gable Designer: inspect a running Gable app, mount one component in isolation, and see language-service problems on the
canvas. Private (not published).

```
npm run build -w packages/designer          # agent + backend (tsc) and the shell (vite)
node packages/designer/dist/server/cli.js examples/todomvc      # then open the printed URL in a browser
node packages/designer/dist/server/cli.js                       # no folder: reopens the most recent project
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

The Content and Style tabs change the project's own files; the Designer keeps no model of the design (ADR 0001). Every edit is a request to
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

## The chrome

The shell's chrome follows the Claude Design boards: a top bar (mode, Select or Interact, connection, undo and redo, theme, palette),
Structure, Insert and Routes on the left, the canvas with its device bar, a bottom drawer (Code, Problems, HMR timeline,
Accessibility, HTTP) and Style, Content and Inspector on the right. Tokens live outside the gable-ui marker block in
`shell/src/shell.css`, mapped onto gable-ui's variables, so components need no `dark:` variant here.

Ctrl K opens the command palette, generated from the current state in `shell/src/app/commands.ts`. Panel sizes, the drawer and
the theme are saved per project with the frame layout (`chrome` in the device settings), never in browser storage.

Extract component, create Scenario and accessibility checks have no backend yet: they show the real part and say the rest is
unavailable, with the action disabled. Nothing pretends to have run.

```
node packages/designer/e2e/chrome-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port>
```

## Projects and the dev server

The project name in the top bar opens **Open a project**: a folder field, the recent projects and a folder lister (folders
only, projects marked). Opening a folder stops the current project's Vite, starts the new one's on the same preview port and
reloads the shell; the backend, its token and the window stay. Recent projects (ten at most) are kept in `recent.json` in the
user data directory; the CLI and the desktop app reopen the most recent one when started without a folder.

The **Connect** dialog checks the project: package.json, Vite, and the Preview agent's in-app hook (`@gable/core/designer`,
`src/server/projects.ts`). When they are listed in package.json but not installed, **Install and start** runs the project's
package manager (`packageManager` field or lockfile: npm, pnpm, yarn or bun) and restarts the dev server; a project that is not
a Gable app, or whose `@gable/core` is too old, is told so and not installed into. The Designer's half of the agent comes from
its Vite plugin, so nothing is added to the source.

When the dev server fails or stops, the canvas says why, shows the end of its log and offers **Restart server** and **Open
log** (the whole output of the project's Vite and of installs run from here). Backend endpoints (`src/server/project-api.ts`,
token-checked): `/api/project/recent`, `/api/project/folders?dir=`, `/api/project/open`, `/api/project/install`,
`/api/server/log`, `/api/server/restart`; the `server`, `log` and `project` events come over `/api/events`.

The driven check is self-contained: it builds a fixture app whose dependencies are not installed (`file:` links into this
checkout, so the install works offline), starts the backend and a headless Edge, and stops only what it started.

```
node packages/designer/e2e/project-check.mjs [--edge <msedge.exe>] [--shot dir] [--keep]
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
In page mode the Scenario picker in the Routes tab reloads the page with `?__gable_scenario=<file>|<scene>`. The Designer's Vite
plugin injects a module that sets `__GABLE_DESIGNER_HOOK__.rootProviders` (the mocks plus the scene's `providers`), which
`bootstrap` appends after the app's own providers in development. The drawer's **HTTP** tab shows the mocks and the request log.
Limits: `inputs` are ignored in page mode, and a scene that needs the router belongs in page mode (component mode mounts
the component alone).

## Tailwind mode

The **Style** tab edits the selected element's classes with the project's own Tailwind v4 design system. It is on when a
stylesheet of the project starts with `@import "tailwindcss"`; the `@theme` block there is the project's design tokens. The
Designer keeps no class table of its own: scales (spacing, color, type, radius, shadow, layout, size), class names, variants
and breakpoints all come from the loaded design system. When it cannot be loaded (no Tailwind v4, a v3 project, the loader
failed or its API changed) the tab says why ("Tailwind mode is off: ...") and nothing else changes; the Content tab keeps working.

- **Loading.** `src/server/tailwind/design-system.ts` is the only file that touches Tailwind. It calls
  `__unstable__loadDesignSystem` from `@tailwindcss/node`, resolved from the project first (so custom `@theme`, `@plugin`,
  `@custom-variant` and `@source` behave as in its build), then through `@tailwindcss/vite`, then the Designer's own copy
  (`@tailwindcss/node`, pinned to `VERIFIED_TAILWIND` = 4.3.5, the version the API below was verified against). The API is
  unstable by Tailwind's own statement: the shape of what comes back is checked (`shapeProblem`), and a mismatch or a load
  error turns the mode off with a message instead of throwing. If Tailwind changes it, only that file and `ds` in it need
  to follow. A stylesheet change in the project reloads the design system (SSE `tailwind` event).
- **Editing.** Only static class tokens are written, through the same `setAttr` class edit as the Content tab (one write path,
  one undo history). A new class replaces an old one when the design system says they set the same CSS properties
  (`px-2` next to `p-4` stays; `p-8` replaces `p-4`; `text-lg` does not replace `leading-6` although both touch `--tw-leading`).
  Only classes with the same variants are compared (`md:p-8` leaves `p-4`). `{{ }}` and `[class.x]` bindings are read-only
  and shown as `conditional: <name>`; classes the design system does not know (the project's own CSS) are never touched.
- **Order.** The repo's formatter decides: when the project's prettier config lists `prettier-plugin-tailwindcss`, an inserted
  class goes where Tailwind's order puts it (classes it does not know stay first); otherwise it is appended. (This repository
  has no class sorter, so edits here append.)
- **Breakpoints.** The selected frame's width picks the breakpoint prefix, using the project's `--breakpoint-*` values (not
  Tailwind's defaults). The panel shows a value set at a smaller breakpoint as inherited (`from md`), mobile-first.
- **States.** The State segment writes `hover`, `focus`, `focus-visible`, `active`, `disabled`, `group-hover`, `group-focus` and
  `dark` variants (composed with the breakpoint: `dark:xl:hover:bg-red-500`). Forced-state preview: on WebView2 (CDP) hover,
  focus and active are forced with `CSS.forcePseudoState` on the selected element (`group-*` on its nearest `.group`); everything
  else (`disabled`, `dark`, and every state without CDP) is a temporary injected rule with `!important`, the pseudo-class
  removed and the media condition unwrapped. A touch-emulated frame has `(hover: none)`, so hover utilities, which Tailwind
  wraps in `@media (hover: hover)`, stay off there when forced over CDP.
- **Palette.** Search the project's classes (variants as typed, or the ones of the current context), hover an entry to see
  its real CSS applied on the canvas without writing anything, Enter or a click writes it. Arbitrary values (`w-[137px]`)
  are accepted when the design system can generate them.

Backend endpoints (`src/server/tailwind/api.ts`, all under `/api/tailwind/`, token-checked like the rest): `info`, `options`,
`analyze`, `plan`, `search`, `css`, `force`. The agent gains `setPreview` (temporary classes, CSS and marks; additive, so
`PROTOCOL_VERSION` is unchanged).

The driven check runs against a Tailwind project (`examples/ui-gallery`) and a project without Tailwind:

```
node packages/designer/e2e/tailwind-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> --source examples/ui-gallery/src/gallery.ts [--no-cdp] [--shot dir]
node packages/designer/e2e/tailwind-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> --off
```
