---
id: TASK-107.2
title: App-side push subscription helper
status: To Do
assignee: []
created_date: '2026-11-14T17:29:00Z'
labels: []
dependencies: []
parent_task_id: TASK-107
ordinal: 272000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v1 scope in ADR 0021 includes push, but an app can only receive pushes: nothing in the package wraps PushManager.subscribe, permission handling or unsubscribe, so apps must reach into navigator.serviceWorker themselves to get a subscription to send to their server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SwPush exposes subscribe(options) (applicationServerKey, userVisibleOnly), getSubscription() and unsubscribe(), and a notification permission state as a signal
- [ ] #2 Unsupported browsers and denied permission are reported as defined outcomes, not thrown surprises
- [ ] #3 The in-memory browser models pushManager and permission so the helper is tested end to end with the existing worker-side push handlers
- [ ] #4 Public API has TSDoc, the docs cover the flow, and the push subscription entry is removed from the docs limits
<!-- AC:END -->
