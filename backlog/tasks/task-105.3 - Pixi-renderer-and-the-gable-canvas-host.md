---
id: TASK-105.3
title: Pixi renderer and the gable-canvas host
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T23:17:00Z'
labels: []
dependencies:
  - TASK-105.1
  - TASK-105.2
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The renderer and DOM-hosted component from TASK-104.5 and 104.7: a Renderer<N> over Pixi 8 display objects with retained-mode property writes, the extensible tag registry (unregistered hyphenated tag is a component host, unhyphenated is a dev error), zIndex sorting, masks via refs, filters, graphics shapes redrawn once per frame, static attribute conversion, canvas size as an injected signal service, and the host's labelling defaults. Pixi loads through a dynamic import on first mount (TASK-104.12). The spike branch has a working first version to start from.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pixiRenderer(options) works as meta.renderer for <gable-canvas>, and scene content renders on a real canvas
- [ ] #2 Signal writes update only the changed Pixi property; dotted paths like [scale.x] work
- [ ] #3 pixi.js is loaded by dynamic import on first mount and a placeholder shows while it loads
- [ ] #4 The host is a role=group element labelled from aria-label or aria-labelledby
- [ ] #5 Scene HMR keeps the Application; destroying the host calls Renderer.destroy and leaves no leaked Pixi objects
- [ ] #6 Tests cover tag registry errors, ordering, shapes, masks and filters
<!-- AC:END -->
