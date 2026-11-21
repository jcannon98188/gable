---
"@gablejs/core": minor
"@gablejs/renderer-pixi": minor
"@gablejs/devtools-extension": minor
"@gablejs/testing": minor
"@gablejs/language-service": minor
"@gablejs/vite": minor
---

Canvas rendering. New `@gablejs/renderer-pixi` package: a Pixi-backed renderer a component opts into with `meta.renderer`, with a Gable-owned frame loop, pointer, keyboard, gamepad and reduced-motion services, asset bundles, accessibility mirror and a scene test renderer.

`@gablejs/core` additions:

- `flushSync()` runs pending effects synchronously and returns how many ran; `whenFlushed()` resolves after the next flush.
- `onCleanup()` registers a teardown on the current scope; `hotData` and `isHotUpdating()` carry state across hot updates.
- `RendererBoundary` and the per-instance boundary registry; devtools shows boundaries.
- Renderer contract: optional `destroy()`, `knowsElement(tag)` and `warnRawTimers`, which warns once per timer in development when a raw timer is used inside a boundary.

`@gablejs/language-service` checks scene tags, including custom tags and `scene-structure`; `@gablejs/vite` exposes `./client` types.
