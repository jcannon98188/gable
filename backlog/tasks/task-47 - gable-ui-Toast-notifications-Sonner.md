---
id: TASK-47
title: 'gable-ui: Toast notifications (Sonner)'
status: To Do
assignee: []
created_date: '2026-11-07T03:32:00Z'
labels:
  - ui
dependencies: []
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn uses Sonner for toasts. Zag has a toast machine, but it needs a global toast store and a region that lives outside the component tree, which no current primitive provides. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A toaster region and an injectable toast API (success, error, promise, action) built on @zag-js/toast or equivalent
- [ ] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->
