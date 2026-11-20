---
kind: ticket
title: DOM renderer and browser bootstrap
status: resolved
blocked_by: [27, 29]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.10 - DOM-renderer-and-browser-bootstrap.md
assignee:
  - '@jason'
ordinal: 31000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 A sample app boots in a real browser through bootstrap
- [x] #2 The conformance suite passes on both renderers
- [x] #3 Unknown tags and properties give clear dev-time errors

## Answer

DOM renderer, conformance suite on both renderers, headless-browser boot test; merged.

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

@gable/renderer-dom: the node operations over the DOM, SVG and MathML namespaces, scoped styles, DOM defer triggers (viewport, interaction, hover), real Location, History and Title, a typed element and property map, and the field binding hook points. A Renderer-contract conformance suite runs against both the Test renderer and the DOM renderer.
