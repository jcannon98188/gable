---
id: TASK-105.14
title: Golden-image tests
status: To Do
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T21:48:00Z'
labels: []
dependencies:
  - TASK-105.10
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 252000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.10 deferred golden images until a real game needs them; TASK-104.12 made them release-blocking. Decide stable GPU or software-GL rendering conditions and tolerance as part of the work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A small set of scenes is compared against stored images in real Chromium with a documented tolerance
- [ ] #2 The stability conditions (renderer, flags, platform) are documented
- [ ] #3 The suite runs in CI or has a documented manual run
<!-- AC:END -->
