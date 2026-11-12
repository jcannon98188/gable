---
id: TASK-105.5
title: 'Input: scene events and the Pointer, Keyboard and Gamepad services'
status: To Do
assignee: []
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T21:47:00Z'
labels: []
dependencies:
  - TASK-105.3
  - TASK-105.4
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 243000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.8: Pixi federated events 1:1 on scene tags (auto eventMode static when a listener is attached, [eventMode] override, [cursor], [hitArea]), injected Pointer, Keyboard (focus-scoped, polled per frame, KeyboardEvent.code, opt-in global) and Gamepad (polled per frame) services, DOM/scene separation by plain DOM rules (touch-action none by default, pointer-events, pointer down focuses the canvas). Verify at build time: pointer capture, touch-action and wheel preventDefault against Pixi 8.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 (pointerdown) and the other federated event names work on scene tags with Pixi's own $event typed by the element map
- [ ] #2 Pointer exposes position, buttons and over-canvas as signals
- [ ] #3 Keyboard offers isDown, justPressed, justReleased per frame and signals, active only while the host has focus
- [ ] #4 Gamepad polls once per frame and exposes snapshots plus connect and disconnect signals
- [ ] #5 Pointer capture, touch-action and wheel preventDefault behaviour is verified and documented
- [ ] #6 Tests cover each service through the test doubles
<!-- AC:END -->
