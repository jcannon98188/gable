---
id: TASK-91
title: 'gable-ui: Tab order is wrong when ui-tab is inside @if'
status: Done
assignee: []
created_date: '2026-11-07T15:21:00Z'
updated_date: '2026-11-07T15:29:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by the designer shell: tabs rendered conditionally with @if do not keep document order (tab buttons and keyboard order differ from the markup order). Reproduce first: contentChildren probably lists a late-created ui-tab last instead of in DOM order.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A failing test reproduces it (tabs A, @if B, C: B appears between A and C after it appears, and in the tab buttons, roving order and Arrow-key order)
- [x] #2 contentChildren (core) or ui-tabs orders by document position; fix in core if contentChildren is the cause and add a core test
- [x] #3 Selected value stays valid when the selected conditional tab disappears
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduce; root cause is core contentChildren appending in creation order; add Renderer.compare and ordered insertion
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: core query registerEntry appended. Fix: optional Renderer.compare (dom + test renderers), insertInOrder in query.ts. Core test in packages/testing/src/slots-queries.test.ts; tabs tests verified failing without fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
contentChildren/viewChildren now list late-created matches in document order via optional Renderer.compare; ui-tabs falls back (model too) to first enabled tab when the selected tab disappears. Tests added in core(testing) and ui.
<!-- SECTION:FINAL_SUMMARY:END -->
