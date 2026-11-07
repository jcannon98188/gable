---
id: TASK-65
title: '@gable/store devtools: log actions (method calls), not only patches'
status: To Do
assignee: []
created_date: '2026-11-07T05:01:00Z'
labels:
  - store
dependencies: []
priority: low
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
withDevtools only logs patchState changes. Method wrappers are blocked because store members are defined non-configurable; either wrap in withMethods or add an opt-in actions wrapper.
<!-- SECTION:DESCRIPTION:END -->
