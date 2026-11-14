---
id: TASK-106
title: Service worker support (@gable/service-worker)
status: To Do
assignee: []
created_date: '2026-11-13T19:55:00Z'
updated_date: '2026-11-14T09:07:00Z'
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
- [x] #1 All subtasks are Done
- [x] #2 A starter app installs, caches, goes offline, and applies an update through activateUpdate() in a production build
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC evidence (TASK-106.8, 2026-11-14): #1 TASK-106.1 to 106.8 are all Done. #2 packages/create-gable/src/scaffold.test.ts, 'installs, works offline and applies an update through activateUpdate()': the create-gable starter with --service-worker, installed from packed tarballs and built with vite build, installs in headless Chromium (gable-precache:<v1>), loads with the server dropping every request, and after a rebuild takes the new release through the banner's activateUpdate() (v1's cache removed, v2 works offline). It passes in npm test on this machine (Edge) and runs in CI on ubuntu-latest wherever Chrome is found; it is skipped without a Chromium. Status left for the coordinator.
<!-- SECTION:NOTES:END -->
