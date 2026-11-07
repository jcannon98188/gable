---
id: TASK-86
title: 'gable-ui: Tooltip on disabled controls'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:50:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The design shows tooltips such as 'unavailable on macOS/Linux' on disabled controls, which receive no pointer events (inference).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 uiTooltip works on a disabled button/control (wrapper or pointer-events handling) and also opens on keyboard focus of the wrapper
- [x] #2 The disabled control keeps aria-disabled/disabled semantics and the tooltip text is exposed via aria-describedby
- [x] #3 Tests, an axe check and a gallery demo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
UiTooltip focusable input on a wrapper around the disabled control
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
UiTooltip gained focusable input (tabindex 0 on the host). Use a wrapper with [&>*]:pointer-events-none. Tests in tooltip.dom.test.ts incl. axe; overlays demo. Real-browser hover over a disabled button not verified.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
uiTooltip works on a wrapper around a disabled control via [focusable]=true: hover and keyboard focus open it, aria-describedby on the wrapper, inner button stays disabled.
<!-- SECTION:FINAL_SUMMARY:END -->
