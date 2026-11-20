---
kind: ticket
title: "gable-ui: Tab order is wrong when ui-tab is inside @if"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-91 - gable-ui-Tab-order-is-wrong-when-ui-tab-is-inside-if.md
priority: medium
ordinal: 152000
---

## Question

Reported by the designer shell: tabs rendered conditionally with @if do not keep document order (tab buttons and keyboard order differ from the markup order). Reproduce first: contentChildren probably lists a late-created ui-tab last instead of in DOM order.

## Acceptance criteria

- [x] #1 A failing test reproduces it (tabs A, @if B, C: B appears between A and C after it appears, and in the tab buttons, roving order and Arrow-key order)
- [x] #2 contentChildren (core) or ui-tabs orders by document position; fix in core if contentChildren is the cause and add a core test
- [x] #3 Selected value stays valid when the selected conditional tab disappears

## Implementation plan

Reproduce; root cause is core contentChildren appending in creation order; add Renderer.compare and ordered insertion

## Implementation notes

Root cause: core query registerEntry appended. Fix: optional Renderer.compare (dom + test renderers), insertInOrder in query.ts. Core test in packages/testing/src/slots-queries.test.ts; tabs tests verified failing without fix.

## Answer

contentChildren/viewChildren now list late-created matches in document order via optional Renderer.compare; ui-tabs falls back (model too) to first enabled tab when the selected tab disappears. Tests added in core(testing) and ui.
