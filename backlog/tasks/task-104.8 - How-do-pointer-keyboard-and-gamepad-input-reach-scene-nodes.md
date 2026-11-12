---
id: TASK-104.8
title: How do pointer, keyboard and gamepad input reach scene nodes?
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T06:09:00Z'
updated_date: '2026-11-12T17:35:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.3
parent_task_id: TASK-104
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide the input model on top of Pixi's federated events (`eventMode`, `.on`, bubbling, `hitArea`): which template event bindings exist on scene tags ((pointerdown), (pointertap), drag), how they map to Renderer.listen and to Gable's `$event` typing, how keyboard and gamepad (which Pixi does not provide) reach the game, how hit areas are expressed, and how scene input and DOM HUD input stay separate (focus, pointer capture).
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T17:35:00Z

---

## Resolution

Input model: Pixi's federated events on scene tags, plus injected `Pointer`, `Keyboard` and `Gamepad` services in the canvas package; DOM/scene separation through plain DOM rules.

1. **Pointer events on scene tags** map 1:1 to Pixi's federated event names, with the same bubbling: `(pointerdown)`, `(pointerup)`, `(pointerupoutside)`, `(pointermove)`, `(pointertap)`, `(pointerover)`, `(pointerout)`, `(pointerenter)`, `(pointerleave)`, `(rightdown)`, `(rightup)`, `(wheel)` and the rest. Attaching a listener sets `eventMode` to `static` automatically; `[eventMode]` overrides it (for example `dynamic` for hover while an object moves under a still pointer). `[cursor]` is a plain property. No core change: core's `listen` passes `$event` through unchanged.
2. **Hit areas:** default is the node's bounds (Pixi's behaviour); `[hitArea]` takes a Pixi hit shape (Rectangle, Circle, Polygon) built in code, usually from a computed signal. Declarative `hit-*` child tags are deferred; they would use the same attachment-child pattern as graphics shapes.
3. **`Pointer` service** (canvas package, injected): signals for pointer position in scene coordinates, buttons down, and whether the pointer is over the canvas, driven from the stage's pointer events. Drag and long-press are not template syntax; they are composed from pointer events plus the `Pointer` service, with helper functions possible later.
4. **`Keyboard` service**: polled per-frame state (`isDown(code)`, `justPressed(code)`, `justReleased(code)`) for frame hooks, plus signals for templates; uses `KeyboardEvent.code`. Listens only while the canvas host has focus; the host sets a tab index and takes focus on pointer down. Opt-in `global` mode listens on the window. Discrete handling stays available as an ordinary `(keydown)` binding on the DOM host.
5. **`Gamepad` service**: polls `navigator.getGamepads()` once per frame in the Gable-owned loop, exposes connected pads with axes and buttons as a per-frame snapshot, plus signals for connect and disconnect. No remapping layer. Action maps (binding "jump" to a key, button or tap) are out of scope, like physics and audio.
6. **DOM and scene separation** uses plain DOM rules: the HUD is DOM next to or over the canvas; overlay containers that must not block the game use `pointer-events: none` with interactive children re-enabling it; the canvas gets `touch-action: none` by default (configurable); pointer down focuses the canvas; the scene never calls `preventDefault` or `stopPropagation` on the underlying DOM event unless a handler calls the matching method on `$event`; no pointer capture by default, since `pointerupoutside` covers drags ending off-canvas. To verify against Pixi 8 in the build phase: pointer-capture behaviour, `touch-action`, and wheel `preventDefault`.
7. **`$event` typing:** handlers receive Pixi's own `FederatedPointerEvent` or `FederatedWheelEvent` unwrapped (`$event.global`, `$event.getLocalPosition(node)`, `$event.stopPropagation()`, `$event.nativeEvent`). The element map from TASK-104.7 declares event name to event type so `(pointerdown)="down($event)"` is checked. No Gable wrapper type.

Follow-ups: accessibility and focus movement between DOM HUD and scene nodes graduated from the fog into a new ticket (accessibility and focus). TASK-104.10 (testing) must cover simulating these events and the three services.

---
<!-- COMMENTS:END -->
