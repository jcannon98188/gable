---
id: TASK-106.8
title: Docs, create-gable option and end-to-end offline and update test
status: To Do
assignee: []
created_date: '2026-11-13T19:56:00Z'
labels: []
dependencies:
  - TASK-106.6
  - TASK-106.7
parent_task_id: TASK-106
ordinal: 269000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The feature is not finished until a starter app can be taken offline and updated. This is the end-to-end proof and the user-facing documentation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/packages/service-worker.md covers the three layers, gable.sw.json and the extend and replace paths
- [ ] #2 create-gable offers a service worker option
- [ ] #3 A browser test installs, goes offline, serves cached content, then applies an update through activateUpdate()
<!-- AC:END -->
