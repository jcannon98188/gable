---
id: TASK-47
title: 'gable-ui: Toast notifications (Sonner)'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:35:00Z'
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
- [x] #1 A toaster region and an injectable toast API (success, error, promise, action) built on @zag-js/toast or equivalent
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Own store (no @zag-js/toast: not installed, adds a dependency for little). ToastService (root scoped) + UiToaster in components/toast.ts. 2. Portal + uiPresence for enter/exit, LiveAnnouncer for announcements, pause on hover/focus. 3. registry-meta entry, tests (in-memory, jsdom with axe), docs section, gallery page toast.html.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented packages/ui/src/components/toast.ts; tests toast.test.ts (in-memory) and toast.dom.test.ts (jsdom, axe, exit animation) pass. Gallery page examples/ui-gallery/toast.html + src/toast-demo(.test).ts added but needs npm run pack:local before it resolves ToastService; not run in a browser. Swipe-to-dismiss not implemented.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ToastService (root scoped: show/success/error/info/warning/loading/promise/dismiss/pause/resume, action buttons) and <ui-toaster> (portalled labelled region, uiPresence exit animation, reduced-motion aware, pause on hover/focus, LiveAnnouncer announcements) as packages/ui/src/components/toast.ts with registry-meta entry, index export, 8 in-memory tests and a jsdom test incl. axe, docs section in docs/ui-primitives.md. Own store used instead of @zag-js/toast. AC3 left unchecked: gallery page toast.html is written but needs npm run pack:local and a browser check. Not covered: swipe-to-dismiss, stacking.
<!-- SECTION:FINAL_SUMMARY:END -->
