---
id: TASK-105.10
title: Real-browser smoke suite
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:53:00Z'
labels: []
dependencies:
  - TASK-105.3
  - TASK-105.5
  - TASK-105.9
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.10: one opt-in real Chromium suite with WebGL, run in CI only on canvas package changes, mounting a scene through the real renderer to catch wiring mistakes that no double can (host lifecycle, DOM and scene event path), plus an axe-core check on a host with an a11y mirror (TASK-104.11).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A scene mounts through the real renderer and renders non-blank
- [ ] #2 A pointer event reaches a scene node and a keyboard event reaches the Keyboard service
- [ ] #3 axe-core reports no violations on a host with an a11y mirror
- [ ] #4 The suite runs in CI only when the canvas package changes
<!-- AC:END -->
