---
id: TASK-52
title: 'gable-ui: OTP input (Input OTP)'
status: To Do
assignee: []
created_date: '2026-11-07T03:32:00Z'
labels:
  - ui
dependencies: []
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Input OTP uses input-otp. Zag has pin-input, which is a close fit but is a separate machine with its own parts and paste handling. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A segmented one-time-code input with paste, backspace and arrow-key handling that works with the [field] directive
- [ ] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->
