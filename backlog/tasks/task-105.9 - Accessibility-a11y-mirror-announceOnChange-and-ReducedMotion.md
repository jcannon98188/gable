---
id: TASK-105.9
title: 'Accessibility: [a11y] mirror, announceOnChange and ReducedMotion'
status: To Do
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T21:48:00Z'
labels: []
dependencies:
  - TASK-105.3
  - TASK-105.5
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 247000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.11: opt-in [a11y] property ({ role, label, description?, focusable?, order? }) on scene tags backed by a Gable-owned hidden DOM mirror (not Pixi's accessibility plugin), non-trapping focus where the host or the mirror elements are tab stops with a DOM focus ring, activation of a mirror element dispatching the node's tap handler, announceOnChange(signal, format) over the existing LiveAnnouncer throttled to one polite message per second, and a ReducedMotion signal service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tagged nodes get a visually hidden DOM element with the given role and label, positioned from node bounds in scene order unless order overrides
- [ ] #2 Click, Enter and Space on a mirror element fire the node's pointer-tap handler
- [ ] #3 Tab and Shift+Tab always leave the canvas and Escape is never captured
- [ ] #4 announceOnChange uses LiveAnnouncer and is throttled
- [ ] #5 ReducedMotion reflects prefers-reduced-motion as a signal
- [ ] #6 The test renderer records the mirror (fixture.scene.a11y(), focus, tab) and announcements
<!-- AC:END -->
