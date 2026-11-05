---
id: TASK-2.10
title: DOM renderer and browser bootstrap
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:27'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.6
  - TASK-2.8
parent_task_id: TASK-2
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

@gable/renderer-dom: the node operations over the DOM, SVG and MathML namespaces, scoped styles, DOM defer triggers (viewport, interaction, hover), real Location, History and Title, a typed element and property map, and the field binding hook points. A Renderer-contract conformance suite runs against both the Test renderer and the DOM renderer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A sample app boots in a real browser through bootstrap
- [x] #2 The conformance suite passes on both renderers
- [x] #3 Unknown tags and properties give clear dev-time errors
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DOM renderer, conformance suite on both renderers, headless-browser boot test; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
