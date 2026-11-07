---
id: TASK-80
title: 'gable-ui: JSON viewer in narrow columns'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:50:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the designer's 304px right panel the JSON viewer's keys get squeezed (TODO(gable-ui)).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Long keys truncate with an ellipsis and show the full key in a tooltip (and aria-label), or wrap when a wrap input is on
- [x] #2 A compact layout input that tightens indentation and shows value on a second line when width is below a threshold
- [x] #3 Tests at a narrow width and a gallery demo in a ~300px column
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. JSON viewer: compact + wrap inputs; truncate keys with title/aria-label. Tree supports labelClass/ title. 2. Narrow tests, 300px gallery demo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
tree gained title tooltip on label, stacked, wrap; json viewer gained compact, compactBelow (ResizeObserver on host), wrapKeys. Full key is in the DOM text so screen readers read it; no extra aria-label added on the span (axe disallows aria-label on generic spans). Limitation: in compact mode the second-line value still shows the ':' prefix. Tests: json-viewer.narrow.dom.test.ts (5, incl. axe at 280px), gallery tree.html 300px columns.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented with unit, DOM, axe and gallery tests; typecheck:tests and build pass; packages/ui + ui-primitives suites and gallery suite pass. See implementation notes for limitations and follow-ups. Not verified in a real browser.
<!-- SECTION:FINAL_SUMMARY:END -->
