---
id: TASK-106.7
title: 'Vite plugin: emit hashed asset manifest and worker file'
status: To Do
assignee: []
created_date: '2026-11-13T19:56:00Z'
labels: []
dependencies:
  - TASK-106.5
parent_task_id: TASK-106
ordinal: 268000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The precache needs a build-time list of hashed assets, and both the default and custom workers use it. This stays in @gable/vite and needs no template awareness.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Production build emits the manifest with content hashes and the worker file
- [ ] #2 A custom worker built on core receives the manifest and keeps atomic versioned updates
- [ ] #3 Nothing is emitted or registered in dev
<!-- AC:END -->
