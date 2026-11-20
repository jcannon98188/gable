---
kind: ticket
title: "Input: scene events and the Pointer, Keyboard and Gamepad services"
status: resolved
blocked_by: [122, 123]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-105.5 - Input-scene-events-and-the-Pointer-Keyboard-and-Gamepad-services.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 243000
---

## Question

canvas/113: Pixi federated events 1:1 on scene tags (auto eventMode static when a listener is attached, [eventMode] override, [cursor], [hitArea]), injected Pointer, Keyboard (focus-scoped, polled per frame, KeyboardEvent.code, opt-in global) and Gamepad (polled per frame) services, DOM/scene separation by plain DOM rules (touch-action none by default, pointer-events, pointer down focuses the canvas). Verify at build time: pointer capture, touch-action and wheel preventDefault against Pixi 8.

## Acceptance criteria

- [x] #1 (pointerdown) and the other federated event names work on scene tags with Pixi's own $event typed by the element map
- [x] #2 Pointer exposes position, buttons and over-canvas as signals
- [x] #3 Keyboard offers isDown, justPressed, justReleased per frame and signals, active only while the host has focus
- [x] #4 Gamepad polls once per frame and exposes snapshots plus connect and disconnect signals
- [x] #5 Pointer capture, touch-action and wheel preventDefault behaviour is verified and documented
- [x] #6 Tests cover each service through the test doubles

## Answer

Added input to packages/renderer-pixi: scene tags take Pixi federated events 1:1 (listener attach sets eventMode static; $event is Pixi's own event, unwrapped); Pointer (position in scene coordinates, buttons bitmask, overCanvas), Keyboard (host-focus-scoped by default, 'global' option; isDown/justPressed/justReleased by code, polled per frame via beginFrame, focusout releases keys), Gamepad (one poll per frame, copies, connected/disconnected signals) provided through the renderer providers; options touchAction (default none), keyboard, getGamepads; autoPreventDefault off. Verified against pixi.js 8.23.0 and written up in docs/research/pixi-input-verification.md: Pixi never calls setPointerCapture, wheel is a passive listener so preventDefault from a scene (wheel) handler cannot stop page scroll. Tests: input.test.ts (18). Verified after merge (integration 617f243): core 96, renderer-pixi 128, testing 370, vite 45, all pass. Gaps: nothing run in a real browser; default getGamepads wiring and platform connect/disconnect events untested; 105.8 doubles not yet used (tests use ApplicationLike and manual scheduler doubles).
