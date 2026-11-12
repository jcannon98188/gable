---
id: TASK-105.21
title: Release-gate measurements
status: To Do
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T22:36:00Z'
labels: []
dependencies:
  - TASK-105.19
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 259000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.14: the spike left these unmeasured and everything is release-blocking. Record each as a measured result in docs/research/: GPU execution time (design a method; gl.finish() returned about 0 ms under ANGLE), Linux, macOS, integrated GPUs, a low-end laptop and a phone, 120 Hz displays, the WebGPU backend, long-run GC pressure (per-frame allocations and heap), text, filters, masks and mixed textures, and high-rate DOM HUD updates beside the scene. Publish the budgets from TASK-104.14 with the low-end and phone numbers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each listed item has a method, results and a results file in docs/research/
- [ ] #2 Published budgets include low-end laptop and phone numbers
- [ ] #3 Any result that misses the budgets creates a tracked follow-up
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T22:36:00Z

---

Dropped by the human: hardware and OS measurement (phones, macOS, Linux, integrated GPUs, 120 Hz, WebGPU) is not part of this build. The budgets published by the optimisation and benchmark tickets use the reference-machine numbers only.

---
<!-- COMMENTS:END -->
