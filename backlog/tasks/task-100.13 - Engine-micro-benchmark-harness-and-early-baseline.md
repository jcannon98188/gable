---
id: TASK-100.13
title: Engine micro-benchmark harness and early baseline
status: To Do
assignee: []
created_date: '2026-11-09T00:15:00Z'
labels:
  - ready-for-agent
dependencies: []
references:
  - docs/js-engine-spec.md
  - docs/adr/0016-the-engine-workspace-stands-alone.md
parent_task_id: TASK-100
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec section 11 says micro-benchmarks should be kept as each engine area lands and are only formalised in M9 (TASK-100.10), but none exist, so there are no speed or memory numbers for M0 to M7. Add a small micro-benchmark harness under native/engine (Agni-agnostic per ADR 0016: no Gable vocabulary or dependencies) that runs the same JS workloads on the owned engine and the QuickJS-NG adapter and records a rough baseline. Separate from, and not a substitute for, the M9 Gable benchmark set and tolerance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A benchmark harness in native/engine runs identical JS micro-workloads (loops, property access and inline-cache hits, string building, array and Map/Set operations, closures and calls, regex, JSON, promise/job throughput, bytecode load versus compile-from-source, engine startup) on both the owned engine and the QuickJS-NG adapter
- [ ] #2 It reports time and peak memory per workload and per engine, and can write results to a machine-readable file for later comparison
- [ ] #3 A first baseline with machine details is committed or documented, with the slowest relative results called out as a short findings note
- [ ] #4 The harness is not part of the default cargo test run and the boundary tests (ADR 0016) still pass
<!-- AC:END -->
