---
kind: ticket
title: Release-gate measurements
status: closed
blocked_by: [138]
tags:
  - archived
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/archive/tasks/task-105.21 - Release-gate-measurements.md
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 259000
---

## Question

canvas/119: the spike left these unmeasured and everything is release-blocking. Record each as a measured result in docs/research/: GPU execution time (design a method; gl.finish() returned about 0 ms under ANGLE), Linux, macOS, integrated GPUs, a low-end laptop and a phone, 120 Hz displays, the WebGPU backend, long-run GC pressure (per-frame allocations and heap), text, filters, masks and mixed textures, and high-rate DOM HUD updates beside the scene. Publish the budgets from canvas/119 with the low-end and phone numbers.

## Acceptance criteria

- [ ] #1 Each listed item has a method, results and a results file in docs/research/
- [ ] #2 Published budgets include low-end laptop and phone numbers
- [ ] #3 Any result that misses the budgets creates a tracked follow-up

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T22:36:00Z

---

Dropped by the human: hardware and OS measurement (phones, macOS, Linux, integrated GPUs, 120 Hz, WebGPU) is not part of this build. The budgets published by the optimisation and benchmark tickets use the reference-machine numbers only.

---
<!-- COMMENTS:END -->
