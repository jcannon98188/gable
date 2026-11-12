# Pixi 8 input behaviour verified for the canvas binding (TASK-105.5)

Checked against pixi.js 8.23.0 (`lib/events/EventSystem.js`). The tests in `packages/renderer-pixi/src/input.test.ts` ("Pixi 8 behaviour the input model relies on", "DOM and scene separation") pin the findings.

## Pointer capture

Pixi's event system never calls `setPointerCapture` (no occurrence in `EventSystem`, `EventBoundary` or `FederatedPointerEvent`). It listens for `pointermove` on `document` and `pointerup` on `window` in the capture phase, so a drag that leaves the canvas still delivers moves and ends with `pointerupoutside` on the node that received the down. The binding therefore adds no capture; a scene that wants it calls `$event.nativeEvent.target.setPointerCapture($event.pointerId)` itself.

## touch-action

Pixi sets `canvas.style.touchAction = "none"` itself when the browser supports pointer events, and resets it on destroy. The binding sets the same default explicitly on the canvas after Application init and makes it configurable (`touchAction` renderer option, so `pan-y` is possible for a vertically scrolling page with a game strip). `touch-action: none` is what lets touch drags reach the scene instead of scrolling the page.

## preventDefault

- `pointerdown`: Pixi calls `preventDefault` on the native event only when `autoPreventDefault` is true and the event was normalised from a legacy mouse or touch event (never for real `PointerEvent`s). The binding sets `renderer.events.autoPreventDefault = false` so the scene never prevents default unless a handler calls `$event.preventDefault()`.
- `wheel`: Pixi registers its wheel listener with `{ passive: true, capture: true }`. A `(wheel)` handler on a scene node therefore **cannot** stop the page from scrolling: `$event.preventDefault()` is ignored (the browser logs a warning). To stop page scroll over the game, use CSS (`overscroll-behavior: contain` on the scroller, or `touch-action`) or add a non-passive `wheel` listener to the host element in the DOM.

## Focus

Pointer down on the canvas focuses the host element (`preventScroll`), which gets `tabindex="0"` unless the author set one. The Keyboard service listens on that host, so keys flow only while the canvas has focus; losing focus (`focusout`) releases every held key.
