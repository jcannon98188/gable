---
kind: ticket
title: "gable-ui: Tooltip on disabled controls"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-86 - gable-ui-Tooltip-on-disabled-controls.md
priority: medium
ordinal: 143000
---

## Question

The design shows tooltips such as 'unavailable on macOS/Linux' on disabled controls, which receive no pointer events (inference).

## Acceptance criteria

- [x] #1 uiTooltip works on a disabled button/control (wrapper or pointer-events handling) and also opens on keyboard focus of the wrapper
- [x] #2 The disabled control keeps aria-disabled/disabled semantics and the tooltip text is exposed via aria-describedby
- [x] #3 Tests, an axe check and a gallery demo

## Implementation plan

UiTooltip focusable input on a wrapper around the disabled control

## Implementation notes

UiTooltip gained focusable input (tabindex 0 on the host). Use a wrapper with [&>*]:pointer-events-none. Tests in tooltip.dom.test.ts incl. axe; overlays demo. Real-browser hover over a disabled button not verified.

## Answer

uiTooltip works on a wrapper around a disabled control via [focusable]=true: hover and keyboard focus open it, aria-describedby on the wrapper, inner button stays disabled.
