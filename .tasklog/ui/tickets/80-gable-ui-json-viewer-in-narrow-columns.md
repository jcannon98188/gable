---
kind: ticket
title: "gable-ui: JSON viewer in narrow columns"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-80 - gable-ui-JSON-viewer-in-narrow-columns.md
priority: medium
ordinal: 137000
---

## Question

In the designer's 304px right panel the JSON viewer's keys get squeezed (TODO(gable-ui)).

## Acceptance criteria

- [x] #1 Long keys truncate with an ellipsis and show the full key in a tooltip (and aria-label), or wrap when a wrap input is on
- [x] #2 A compact layout input that tightens indentation and shows value on a second line when width is below a threshold
- [x] #3 Tests at a narrow width and a gallery demo in a ~300px column

## Implementation plan

1. JSON viewer: compact + wrap inputs; truncate keys with title/aria-label. Tree supports labelClass/ title. 2. Narrow tests, 300px gallery demo.

## Implementation notes

tree gained title tooltip on label, stacked, wrap; json viewer gained compact, compactBelow (ResizeObserver on host), wrapKeys. Full key is in the DOM text so screen readers read it; no extra aria-label added on the span (axe disallows aria-label on generic spans). Limitation: in compact mode the second-line value still shows the ':' prefix. Tests: json-viewer.narrow.dom.test.ts (5, incl. axe at 280px), gallery tree.html 300px columns.

## Answer

Implemented with unit, DOM, axe and gallery tests; typecheck:tests and build pass; packages/ui + ui-primitives suites and gallery suite pass. See implementation notes for limitations and follow-ups. Not verified in a real browser.
