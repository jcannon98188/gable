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
  `imports`), `delete`, `move`, `wrap` (`@if`/`@for`), `setMeta` (selector/id/encapsulation), `setCss` (one declaration of a rule), `addScene` and `extract` (below).
- Read-only: events, refs, i18n, opaque expressions and `{{ }}` interpolations are shown, never rewritten (`readonly` error).
- Formatting: a template that is formatter-clean before the edit is reformatted as a whole with the repo's formatter options
  (`.prettierrc` / `package.json#prettier`), so the result equals formatter output; any other template is touched only where the
  edit is. CRLF files stay CRLF.
- History: each write records a reverse patch (`hunks.ts`, with surrounding context). Undo/redo first try the exact position, then a
  unique match of the context, and otherwise report a `conflict` and write nothing. The backend's file watcher flags history entries
  of files changed outside the Designer (`history` event; the panel shows it). An entry can span files (extract writes the source
  and creates the component): every file is located before any is written, a created file is removed by its undo and re-created by
  redo, and a conflict in any file refuses the whole step.
- **New Scenario** (`addScene`, `src/server/edit/scenario.ts`): adds a scene to the component-mode scenes file as one insertion after
  its last scene, keeping the file's layout, quotes and trailing commas (the TypeScript parser finds `scenes`; a computed `scenes`
  is refused). An empty scene, or a copy of another scene's definition as written with the new description. The scenes file's
  hot update lists it, and the shell mounts it.
- **Extract component** (`extract`, `src/server/edit/extract.ts`): moves the selected element into `<kebab-name>.ts` beside the
  template's file (selector `app-<kebab-name>`, `html` imported like the source does, template formatter-clean), imports the
  components its markup uses (matched by the palette's selectors; an unknown custom element is refused), and replaces the
  element, or every identical copy in the template, with the new tag; the class is imported and listed in `imports`. Only static
  markup moves: bindings, events, refs, blocks and `{{ }}` read the old component's state and are refused with the reason
  (`describe` reports this as `extract` before anything is tried). Scoped `styles` do not follow; the result says so.

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
Accessibility, Performance, HTTP) and Style, Content and Inspector on the right. Tokens live outside the gable-ui marker block in
`shell/src/shell.css`, mapped onto gable-ui's variables, so components need no `dark:` variant here.

Ctrl K opens the command palette, generated from the current state in `shell/src/app/commands.ts`. Panel sizes, the drawer and
the theme are saved per project with the frame layout (`chrome` in the device settings), never in browser storage.

Extract component and create Scenario write source through the edit API; the flows with no backend yet show the real part and say the rest is unavailable, with the action disabled. Nothing pretends to have run.

```
node packages/designer/e2e/chrome-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port>
```

## Last patch and accessibility checks

The drawer's **Code** tab shows the unified diff of the patch Undo would take back (`src/server/edit/diff.ts`: a line diff of
the file before and after the write, three lines of context, `a/` and `b/` headers, CRLF compared as LF). It is computed when
the patch is written (and again on redo) and sent as `last` in the history (`/api/edit/history` and the `history` event); only
that one diff is sent. Undo and Redo sit next to it.

The **Accessibility** tab lists what the Preview agent's checker found on the selected frame's page. The checker is
[axe-core](https://github.com/dequelabs/axe-core), a dependency of the Designer (the project needs none): the Designer's Vite
plugin serves it at `/__gable-designer/axe.js` and the agent loads it on the first run (`src/agent/a11y.ts`). It runs in the
real page, so contrast is measured on painted colours; the Designer's overlay is hidden and excluded while it runs. Each
failing element is a row with its rule, impact and axe's own explanation, linked to the template node that renders it (or its
nearest rendered ancestor); clicking a row selects the element. Checks axe cannot decide (text over an image, say) are listed
as "review", never as passed. Component mode turns off the rules that judge a whole document (title, `lang`, landmarks), since
they would report on the Designer's host page. The shell runs the checks when the frame connects, after a hot update, a
navigation or a tree change (debounced), and on Re-run; the tab's badge counts violations. The protocol gained the `a11y`
method; it is additive, so `PROTOCOL_VERSION` is unchanged. Automated checks find only part of the problems.

```
node packages/designer/e2e/a11y-diff-check.mjs     # spawns the backend on test-fixtures/a11y-app and a headless Edge, stops only those
```

## Performance

The drawer's **Performance** tab shows what the browser itself measured in the selected frame's page: the Preview agent
observes the Performance Timeline from the moment it starts (`PerformanceObserver`, buffered: paint, largest-contentful-paint,
layout-shift, longtask, event, navigation, resource; `src/agent/perf.ts`) and turns it into TTFB, FCP, LCP, CLS (session
windows), INP (each interaction's longest event, the 98th percentile past 50) and TBT (long tasks past 50 ms from FCP to the
measurement, as there is no TTI), plus DOM size, rated with the web-vitals thresholds (Lighthouse's for TBT and DOM size). The
LCP element, each layout shift's sources and the slowest interaction's target are resolved to their template node: clicking
one selects it on the canvas. Below are navigation timing, long tasks, interactions, a request summary (the Designer's own
requests counted apart) and what the devtools hook already counts (signal flushes, effect runs, the slowest flush, the first
component tree, the last hot update's time to the next rendered frame). Nothing is simulated: a metric whose entries the engine
does not report is shown as n/a with the reason, never as zero, and INP waits
for an interaction (Interact mode). The numbers come from the dev server (unminified modules, the HMR client, no compression),
so they are indicative of the page, not of a production build; every report says so, and names the frame's size and throttling.

The shell measures when the frame connects or reloads, after a hot update or a navigation (each a second after it settles), and
on **Re-run**, which reloads the frame (the agent keeps the session and, in Component mode, the Scene) and measures the fresh
load. With CDP (the Windows desktop app, or a browser started with a debugging port) the tab throttles the selected frame's
CPU (4×, 6×, 20×) and network (DevTools' Fast 4G, Slow 4G, Slow 3G) through `/api/devices/throttle`
(`Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions` on the frame's target); throttling is per frame, not saved,
and re-applied when the frame reconnects. Elsewhere it is labelled unavailable. The protocol gained the `performance` and
`reload` methods; both are additive, so `PROTOCOL_VERSION` is unchanged. MCP `get_performance` returns the same report
(`reload: true` measures a fresh load first).

```
node packages/designer/e2e/perf-check.mjs            # spawns the backend (with CDP) on test-fixtures/perf-app and a headless Edge, stops only those
node packages/designer/e2e/perf-check.mjs --no-cdp   # the same without CDP: throttling labelled unavailable
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
# or against a running window (started on examples/ui-gallery with a fresh GABLE_DESIGNER_DATA):
node packages/designer/e2e/project-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port>
```

New Scenario and Extract component have their own self-contained check: it starts the built Designer on `examples/todomvc` and a
headless Edge/Chromium, drives both dialogs, undoes both edits, puts the project's files back and stops only what it started.
`examples/todomvc` needs its own dependencies installed (`todomvc-common` and `todomvc-app-css`).

```
node packages/designer/e2e/writers-check.mjs [--browser <path to msedge/chrome>]
# or against a running window on examples/todomvc:
node packages/designer/e2e/writers-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port>
```

## Canvas and panel polish

- **Read-only hatch.** An element the panels cannot edit is drawn on the canvas with an amber dashed outline, a diagonal
  hatch and a lock chip naming why: `read-only` (the edit service refuses its template), `dynamic` (Tailwind mode meets a
  class list that a binding sets whole, `[attr.class]="expr"`; `[class.x]="cond"` only toggles one class and leaves the
  written list editable) or `stale` (its template no longer compiles, see below). The agent draws it (`setReadOnly`); the
  shell decides when (`CanvasOverlays` in `shell/src/app/canvas-overlays.ts`).
- **Templates that do not compile.** The runtime compiles a template when it renders it, so a saved template that does not
  compile (`class="x {{ y() }}"`, an unclosed element, an expression the parser rejects) fails only in the page: its hot
  update is rolled back and the canvas keeps the last good version. The backend runs the language service's syntax pass
  (`checkTemplateSyntax`, no type-check) on every changed file and sends the result at once (`GET /api/compile`, SSE
  `compile`), ahead of the full analysis. A banner over the canvas names the file, line, column and message, and says the
  canvas shows the last good version once the page has refused the update (`shell/src/app/stale-canvas.ts`). A refused
  update that the check has nothing against, such as a setup that throws, is shown from the HMR timeline instead. Problems
  lists the error until the analysis catches up, the HMR timeline repeats it, and MCP `get_problems` returns it as
  `notCompiling`. All of it clears with the next save that compiles.
- **Class conflicts.** `/api/tailwind/analyze` also returns `conflicts`: pairs of classes in the list that override each other
  outright at the same variants (`p-2 p-8`, `md:p-4 md:p-8`; not `px-2 p-4`). The design system's class order picks the
  winner. The Style tab shows a callout per pair with **Remove** for the losing class, and while a class is previewed it says
  which classes applying it would replace (a dry run of `plan`).
- **Text size.** The device bar's **Aa** select scales the frame's root font size (85% to 200%), so rem-based type follows; px
  sizes do not. It is part of the frame's emulation and saved with it (`textScale`, left out at 100%).
- **Sync selection.** With Sync on, the selected element is outlined in every other frame that renders it, and the device bar
  says in how many (`li.todo selected in 2 of 3 frames`). Agent method `mirror`.
- **Back and Forward** (page mode) go through the URLs the router reported, kept by the shell (`NavHistory` in
  `page-state.ts`), not the iframe's `history`, whose session history is shared with the shell's.
- **Drag insert.** Drag an Insert entry onto a frame: the agent finds the element under the pointer (`dropTarget`) and draws
  the insertion line; before or after it, or inside it at the end when the pointer is in its middle half. The drop is an ordinary
  `insert` edit (one undo step). Escape cancels. Clicking an entry still inserts at the selection.
- **Quick fixes.** Language service diagnostics with a fix in the same file show a **Fix** button in the Problems tab (and a
  command). `/api/diagnostics/fix` takes only the diagnostic's id: the server applies its own copy of the fix, and only while the
  file still has the hash it was analysed at, as one undoable edit.
- **Template outline.** With an element selected, Structure lists its component's template (`/api/edit/outline`): elements
  with their classes and bindings, `{{ }}` text, and `@if`/`@for` blocks, which are read-only. Elements not rendered right
  now are dimmed; a row click selects that element, hovering highlights it.

The agent methods (`setReadOnly`, `mirror`, `dropTarget`, `textScale` in `setEmulation`) are additive, so `PROTOCOL_VERSION`
is unchanged. The driven check spawns nothing itself; run it against todomvc and against ui-gallery:

```
node packages/designer/e2e/polish-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> --project examples/todomvc
node packages/designer/e2e/polish-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> --tailwind examples/ui-gallery/src/gallery.ts
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
  Only classes with the same variants are compared (`md:p-8` leaves `p-4`). `[class.x]` bindings and whole-list bindings
  (`[attr.class]`, `[className]`) are read-only and shown as `conditional: <name>`. A whole-list binding makes the written
  class list read-only too, since it overwrites it; classes the design system does not know (the project's own CSS) are never touched.
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

## Agents (MCP)

The backend hosts an [MCP](https://modelcontextprotocol.io) server (`src/server/mcp/`, official TypeScript SDK) so a coding agent
can drive the Designer the way a person does: read the project, change what the window shows, select and edit elements,
and look at the result. The agent and the human share one Designer:

- **Project facts** (components, scenes, routes, problems, undo history, Tailwind) are read from backend state.
- **UI state** (mode, page/component target, scene, Scenario, route, frames, selection) and the running app (component tree,
  signals, HMR, mocked HTTP) live only in the shell. Those tools send a command to the open window over a channel of its own
  (`/api/shell/channel` SSE down, `POST /api/shell/reply` up; `src/control-protocol.ts`), and the shell does what the click
  would (`shell/src/app/control-channel.ts`). The person sees every change, and the shell stays the only owner of UI state.
  When no window is open, these tools answer with the URL to open.
- **Every edit** goes through the edit service, so it is the same minimal patch as a UI edit, on the same undo stack. Each
  edit answers with the unified diff it wrote and the edited element's new source position.

Elements are named by source position, `{ file, line, column }` (1-based, project-relative, anywhere inside the element), or
left out to mean the element selected in the window.

| Group | Tools |
| --- | --- |
| Read | `get_status` (call first), `list_components`, `list_scenes`, `list_routes`, `get_problems`, `get_history`, `describe_element`, `get_selection`, `get_styles`, `get_tree`, `get_signals`, `get_hmr_timeline`, `get_http_log`, `get_performance` |
| Window | `set_mode`, `show_page`, `show_component`, `set_scene`, `set_scenario`, `navigate`, `add_frame`, `update_frame`, `remove_frame`, `select_frame`, `select_element` (by position or CSS selector) |
| Edit | `edit_text`, `set_attribute`, `bind`, `insert_element`, `delete_element`, `move_element`, `wrap_element`, `set_component_meta`, `set_css`, `edit_classes` (Tailwind, at a breakpoint and state), `undo`, `redo` |
| See | `screenshot`: a PNG of a frame as MCP image content |

**Screenshots.** In the desktop app (WebView2 with a CDP port) the live frame is captured over CDP: the frame's own target
when the browser allows it, otherwise the frame's rectangle clipped from the Designer window and scaled back to 100%.
Without CDP (the browser mode), the frame's URL (route and Scenario included) is rendered fresh in a headless Chromium or
Edge at the frame's size, pixel ratio and emulation. State that only the open window holds (typed input, an opened menu) is
not in that render. Set `GABLE_CHROME` to the browser to use when it is not found.

**Transport and auth.** Streamable HTTP at `<backend>/mcp`, on 127.0.0.1 only, with the same Host check as the rest of the
API (DNS rebinding). Each backend makes a random **per-session MCP token**, separate from the shell's token. A request
without `Authorization: Bearer <token>` gets 401. The URL and token are printed in the `GABLE_DESIGNER_READY` line
(`"mcp": { "url", "token" }`) and written to a **session file** that only the user can read:
`<data dir>/mcp/<project hash>.json`, in the same user data directory as the frame settings (`GABLE_DESIGNER_DATA`, else
the platform's per-user `gable-designer` directory). It is removed on exit.

**stdio.** `gable-designer mcp <projectDir>` is a stdio MCP server that proxies to the Designer running for that project,
found through its session file. If none is running it starts a backend in-process and prints the URL to open on stderr
(`--no-start` refuses instead). `--url` and `--token` skip the session file.

Client config, stdio (Claude Code `.mcp.json`, Claude Desktop, Cursor and others use the same shape):

```json
{
  "mcpServers": {
    "gable-designer": {
      "command": "node",
      "args": ["<repo>/packages/designer/dist/server/cli.js", "mcp", "<path to the project>"]
    }
  }
}
```

Streamable HTTP (a client that speaks it, with the URL and token from the READY line or the session file):

```json
{
  "mcpServers": {
    "gable-designer": {
      "type": "http",
      "url": "http://127.0.0.1:4700/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

The tools are covered against `test-fixtures/mcp-app` in `src/mcp.test.ts`, which uses an in-memory client and a fake
window. The driven check runs a real backend, the shell in headless Edge, and clients over HTTP and stdio:

```
npm run build -w packages/designer && node packages/designer/e2e/mcp-check.mjs [--browser <path>] [--shot dir]
# or against a running window (it switches the window to the fixture and back; the no-CDP phase is skipped):
node packages/designer/e2e/mcp-check.mjs --port <cdp port> --shell 127.0.0.1:<designer port> --data <the window's GABLE_DESIGNER_DATA>
```
