# @gable/devtools-extension

A browser extension (Manifest V3, for Chrome, Edge and other Chromium browsers) that adds a **Gable** panel to the browser devtools. It shows the component tree, each component's inputs, signals and computeds with live values and dependency edges, an effect log with flush timings, the injector tree, router state, HMR events and anything your stores register. It is an application: a private extension bundle that nothing imports, so there is no API reference for it. The full guide, with the manual test checklist, is [Devtools](../devtools.md).

It works on **development builds only**. The instrumentation lives in `@gable/core` behind the `DEV` flag and is removed from production builds, so a production page has no hook and the panel shows "Waiting for a Gable app".

## Install it

The extension is not published to a store. Build it from a checkout and load it unpacked:

```
npm install
npm run build -w packages/devtools-extension
```

This writes `packages/devtools-extension/dist/`. Then:

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick `packages/devtools-extension/dist`.
4. Start an app with the Vite dev server, open it, then open the browser devtools. The toolbar icon gets a **G** badge on pages where a Gable dev build answered, and a **Gable** panel appears next to Elements. Reload the page once if it was open before you installed the extension.

After rebuilding, press the reload button on the extension's card in `chrome://extensions`, then close and reopen the devtools.

## The panel

- **Components**: the tree (hovering a row outlines the element in the page) and, for the selected component, its inputs, signals and computeds with live values. Click a name to see what it reads and what reads it. Double-click an editable value to write it as JSON; the page sees a normal signal write. **Open source** opens the component's file in your editor (this needs the Vite dev server and a configured editor, `EDITOR` or `LAUNCH_EDITOR`). **Pick from Elements** selects the component of the element chosen in the Elements panel, and **Reveal element** does the reverse.
- **Injectors**: the injector tree with providers and resolved values.
- **Router**: the URL, params, query, data, the route table with the active chain and navigation events. Typing a URL and pressing Enter navigates.
- **Effects**: one row per flush, with the effects that ran and their timings, slow ones in red. Timings are measured only while the panel is connected, so an idle app pays nothing.
- **HMR**: hot update status and errors.
- **Stores**: state and history registered through `registerInspector`.

## Show a store in the panel

```ts
const hook = (globalThis as any).__GABLE_DEVTOOLS_HOOK__;
const handle = hook?.registerInspector("cart", { label: "Cart store", snapshot: () => store.state() });
handle?.log("add", { sku: "a1" });
```

`snapshot()` is called whenever the Stores tab refreshes, and `log(type, data)` appends a history entry (the last 500 are kept). Guard the registration with `DEV` so production builds drop it. No dependency on core internals is needed. For a `signalStore`, the `withDevtools("Cart")` feature from `@gable/store` does this for you.

## How it works

`@gable/core` installs `window.__GABLE_DEVTOOLS_HOOK__` in development. A script in the page's own world (`inject.js`) speaks a protocol over `window.postMessage`, a content script relays it to the service worker, and the service worker relays it to the devtools panel and sets the badge. The panel itself is plain TypeScript, not Gable, so it adds no dependency on the framework it inspects and cannot inspect itself.

## Why there is no live demo here

The extension needs the browser's extension APIs and a real devtools window, which a web page cannot provide. Install it as above and open any example app.
