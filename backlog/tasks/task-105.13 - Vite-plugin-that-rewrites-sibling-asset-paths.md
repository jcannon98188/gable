---
id: TASK-105.13
title: Vite plugin that rewrites sibling asset paths
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:35:00Z'
labels: []
dependencies:
  - TASK-105.6
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 251000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spritesheet JSON and bitmap-font descriptors reference sibling files by relative path, which Vite hashing breaks, so TASK-104.9 put those families in public/. The rewrite plugin was deferred and is now release-blocking (TASK-104.12). It must not change the provideAssets manifest API.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hashed spritesheet and bitmap-font families load correctly in dev and in a production build
- [ ] #2 No change to the manifest API
- [ ] #3 Tested in the example app
<!-- AC:END -->
