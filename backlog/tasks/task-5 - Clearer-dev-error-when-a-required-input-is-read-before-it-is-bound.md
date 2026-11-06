---
id: TASK-5
title: Clearer dev error when a required input is read before it is bound
status: To Do
assignee: []
created_date: '2026-11-06 03:23'
labels:
  - dx
dependencies: []
priority: low
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host-binding ordering bug (fixed: meta.host bindings now apply in render() after the parent binds inputs) surfaced only as 'Required input todo of TodoItem was read before it was set', with no hint that setup timing was the cause. Other reads of a required input from setup-time code (field initialisers, effects created in setup) can still hit this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The error names where the read happened (host binding, setup, effect) and says inputs are bound after setup
- [ ] #2 Docs state when a required input may first be read
<!-- AC:END -->
