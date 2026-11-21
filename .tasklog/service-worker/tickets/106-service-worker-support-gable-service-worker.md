---
kind: ticket
title: "Service worker support (@gablejs/service-worker)"
status: resolved
created: 2026-11-13
updated: 2026-11-14
imported_from: backlog/tasks/task-106 - Service-worker-support-gable-service-worker.md
documentation:
  - docs/adr/0022-service-worker-support-is-one-layered-package-and-web-only.md
ordinal: 261000
---

## Question

Gable apps have no way to work offline or receive push. Support ships as one layered package: a core authoring API, a default declarative worker, and app-side services. See docs/adr/0022-service-worker-support-is-one-layered-package-and-web-only.md for the decisions (layering, app-controlled updates, web-only).

## Acceptance criteria

- [x] #1 All subtasks are Done
- [x] #2 A starter app installs, caches, goes offline, and applies an update through activateUpdate() in a production build

## Implementation notes

AC evidence (service-worker/115, 2026-11-14): #1 service-worker/108 to 106.8 are all Done. #2 packages/create-gable/src/scaffold.test.ts, 'installs, works offline and applies an update through activateUpdate()': the create-gable starter with --service-worker, installed from packed tarballs and built with vite build, installs in headless Chromium (gable-precache:<v1>), loads with the server dropping every request, and after a rebuild takes the new release through the banner's activateUpdate() (v1's cache removed, v2 works offline). It passes in npm test on this machine (Edge) and runs in CI on ubuntu-latest wherever Chrome is found; it is skipped without a Chromium. Status left for the coordinator.

## Answer

Service worker support shipped as one layered package, @gablejs/service-worker: core authoring API (routing, caching strategies, versioned precache, lifecycle, typed messages, push and background sync), a default runtime driven by gable.sw.json, app-side services with an update signal, a gableServiceWorker() Vite plugin, a create-gable --service-worker option, docs, and a headless-browser end-to-end test (install, offline, update via activateUpdate()). Decisions in docs/adr/0022. Known gaps recorded in docs/packages/service-worker.md: no push subscription helper, no app-side background sync registration, no precache hash verification, no clients.claim on first activation.
