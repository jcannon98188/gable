---
id: TASK-107.4
title: Worker claims the page on first activation
status: To Do
assignee: []
created_date: '2026-11-14T17:29:00Z'
labels: []
dependencies: []
parent_task_id: TASK-107
ordinal: 274000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a first visit the worker installs and activates but does not control the page that registered it, so the app is not offline-ready until a reload. Updates must stay app-controlled, so claiming has to be limited to the case where there is no previous release to protect.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On first activation, when no previous release controls any page, the worker claims its clients so the registering page is controlled without a reload
- [ ] #2 Activation of an update never claims clients on its own: app-controlled updates behave as before
- [ ] #3 The app-side services handle the controller change on first claim without reporting a false update
- [ ] #4 The create-gable browser test proves offline works after the first visit without a reload; docs drop this from the limits
<!-- AC:END -->
