---
id: TASK-56.12
title: 'Designer: canvas and panel polish (hatch, conflicts, text scale, sync, insert)'
status: To Do
assignee: []
created_date: '2026-11-07T15:20:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. Gaps: no amber hatch/lock for read-only elements on canvas; no Tailwind class conflict callouts or suggestions; no text-scale env control; selection not mirrored across frames (optional sync); no route back/forward buttons; no drag-to-insert from Insert tab; no Fix action in Problems; Structure shows component tree not template outline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Read-only amber hatch on canvas; class conflict callouts with suggestion in Style panel; text-scale control; optional cross-frame selection/interaction sync
- [ ] #2 Route back/forward, drag insert from Insert tab, Problems Fix action, template outline in Structure
- [ ] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->
