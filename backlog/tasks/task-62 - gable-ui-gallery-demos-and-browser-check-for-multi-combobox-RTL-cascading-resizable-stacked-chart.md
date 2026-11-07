---
id: TASK-62
title: >-
  gable-ui: gallery demos and browser check for multi-combobox, RTL/cascading
  resizable, stacked chart
status: To Do
assignee: []
created_date: '2026-11-07T04:58:00Z'
labels:
  - ui
dependencies: []
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second-pass additions (UiMultiCombobox, resizable RTL and cascading drags, chart stacked/legend toggle/animation) are covered by jsdom tests only. Add a multi-combobox demo and an RTL resizable demo to examples/ui-gallery (needs pack:local; gallery.ts is shared), and verify pointer drags, RTL layout, the chart enter animation and prefers-reduced-motion in a real browser.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Gallery shows multi-combobox, RTL resizable group and stacked chart with legend toggling
- [ ] #2 Checked in a browser: pointer drag cascade, RTL drag direction, chart animation and reduced motion
<!-- AC:END -->
