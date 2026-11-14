---
id: TASK-106
title: Service worker support (@gable/service-worker)
status: To Do
assignee: []
created_date: '2026-11-13T19:55:00Z'
labels: []
dependencies: []
documentation:
  - docs/adr/0021-service-worker-support-is-one-layered-package-and-web-only.md
ordinal: 261000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable apps have no way to work offline or receive push. Support ships as one layered package: a core authoring API, a default declarative worker, and app-side services. See docs/adr/0021-service-worker-support-is-one-layered-package-and-web-only.md for the decisions (layering, app-controlled updates, web-only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks are Done
- [ ] #2 A starter app installs, caches, goes offline, and applies an update through activateUpdate() in a production build
<!-- AC:END -->
