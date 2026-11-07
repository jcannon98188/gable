# Gable DevTools

A browser extension (Manifest V3: Chrome, Edge and other Chromium browsers) that adds a **Gable** panel to the browser devtools: the component tree, each component's inputs, signals and computeds with live values and dependency edges, an effect log with flush timings, the injector tree, router state, HMR events, and anything registered by stores.

It works on **development builds only**. The instrumentation lives in `@gable/core` behind the `DEV` flag and is removed from production builds, so a production page has no hook and the extension shows "Waiting for a Gable app".

## Load it unpacked

```sh
npm install
npm run build -w packages/devtools-extension
```

This writes `packages/devtools-extension/dist/`.

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick `packages/devtools-extension/dist`.
4. Start an app with the Vite dev server, open it, then open the browser devtools. The toolbar icon gets a **G** badge on pages where a Gable dev build answered, and a **Gable** panel appears next to Elements. Reload the page once if it was open before you installed the extension.

After rebuilding the extension, press the reload button on its card in `chrome://extensions`, then close and reopen the devtools.

## What the panel does

- **Components**: the tree (hover outlines the element in the page), and for the selected component its inputs, signals and computeds with live values. Click a name to see what it reads and what reads it. Double-click an editable value to write it (JSON; the page sees a normal signal write). **Open source** opens the component's file in your editor. **Pick from Elements** selects the component of the element chosen in the Elements panel; **Reveal element** does the reverse.
- **Injectors**: the injector tree with providers and resolved values.
- **Router**: URL, params, query, data, the route table with the active chain, navigation events; typing a URL and pressing Enter navigates.
- **Effects**: one row per flush with the effects that ran and their timings (slow ones in red). Timings are only measured while the panel is connected, so an idle app pays nothing.
- **HMR**: hot update status and errors.
- **Stores**: state and history registered through `registerInspector` (below).

## Open in editor

The panel asks the page's hook to call Vite's built-in `/__open-in-editor` endpoint. The hook gets a component's module from the HMR registration (`registerModule`) and the project root from `globalThis.__GABLE_DEV_SERVER__`, which `@gable/vite` injects into `index.html` in dev. It needs the Vite dev server, a configured editor (`EDITOR` or `LAUNCH_EDITOR`), and components registered with the Gable Vite plugin.

## How it works

```
page (main world)         content script        service worker        devtools panel
window.__GABLE_DEVTOOLS_HOOK__
   ^                                             
inject.js (bridge) <-- window.postMessage --> content.js <-- port --> Relay <-- port --> panel
```

- `@gable/core` installs `window.__GABLE_DEVTOOLS_HOOK__` in dev (`DEV && typeof window !== "undefined"`). It is transport agnostic: `hook.call(method, params)` returns JSON-safe results, `hook.connect(listener)` pushes events, `hook.element(id)` and `hook.componentFor(node)` map between ids and elements. Methods: `hello`, `tree`, `component`, `signal`, `setSignal`, `highlight`, `openInEditor`, `injectors`, `injector`, `routers`, `navigate`, `effectLog`, `clearEffectLog`, `hmrLog`, `inspectors`. The extension only talks to the page through this hook.
- `inject.js` runs in the page's own world (`world: "MAIN"`) and speaks the protocol over `window.postMessage`. `content.js` relays it to the service worker over a port. The service worker (`Relay`) keeps per-tab state, sets the badge and keeps one hook subscription while any panel is open.
- The protocol is in `packages/devtools-extension/src/protocol.ts`; the panel's logic (`src/panel/model.ts`) has no DOM or `chrome.*` dependency and is unit tested, as is the whole page-to-panel path.
- **Decision**: the panel UI is plain TypeScript, not Gable. It stays small, adds no dependency on the framework it inspects, and cannot inspect itself.

## Plugging a store (or anything) into the panel

```ts
const hook = (globalThis as any).__GABLE_DEVTOOLS_HOOK__;
const handle = hook?.registerInspector("cart", { label: "Cart store", snapshot: () => store.state() });
handle?.log("add", { sku: "a1" });
```

`snapshot()` is called whenever the Stores tab refreshes; `log(type, data)` appends a history entry (the last 500 are kept). Guard the registration with `DEV` so production builds drop it. No dependency on core internals is needed.

## Manual checklist

Run against an example app with the dev server, with the extension loaded unpacked.

- [ ] The toolbar icon shows **G** on the app tab; it does not on a non-Gable page; it does not on a production build of the app (`vite build` then `vite preview`).
- [ ] The Gable panel appears in the devtools; the tree lists the app's components nested correctly.
- [ ] Hovering a tree row outlines the matching element in the page; leaving removes the outline; closing the panel removes it.
- [ ] Selecting a component shows its inputs, signals and computeds with current values; clicking in the app updates them within about a second.
- [ ] Clicking a computed shows what it reads and what reads it; clicking a chip jumps to that signal.
- [ ] Double-click a signal value, type JSON, press Enter: the page updates. Invalid JSON shows an error and keeps the editor open. Escape cancels.
- [ ] Effects tab: interacting with the app adds flush rows with timings; Clear empties it.
- [ ] Injectors tab shows root and component injectors with resolved values.
- [ ] Router tab shows the URL and active route; navigating in the app updates it; Enter on the URL field navigates.
- [ ] **Open source** opens the component file in the editor.
- [ ] Edit a component and save: HMR tab lists the update, and the tree and values refresh without losing state.
- [ ] Select an element in the Elements panel, use **Pick from Elements**: the matching component is selected. **Reveal element** selects its element in Elements.
- [ ] Reload the page and navigate with the panel open: the panel reconnects on its own.
- [ ] Works in both Chrome and Edge, light and dark devtools themes.
