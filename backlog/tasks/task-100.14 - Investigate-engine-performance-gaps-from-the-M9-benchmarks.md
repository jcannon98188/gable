---
id: TASK-100.14
title: Investigate engine performance gaps from the M9 benchmarks
status: To Do
assignee: []
created_date: '2026-11-09T00:18:00Z'
updated_date: '2026-11-09T00:21:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.10
references:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After M9 records the Gable benchmark set and the interim-engine baseline (TASK-100.10, with the early micro-benchmarks from TASK-100.13), find out WHY the owned engine is slower or heavier than the interim engine where it is. Investigation only: profile and explain, do not tune. The fixes are a separate job: each distinct cause becomes its own task, to be implemented by a Fable agent (an investigator Opus agent hands over ranked findings; it does not fix them). Not covered by M9, whose scope is the benchmark gate and switch-over report.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every benchmark in the M9 set and the TASK-100.13 micro-benchmarks where the owned engine is outside the proposed tolerance, or clearly slower or heavier than the interim engine, is profiled (CPU samples, allocation and GC counts, inline-cache hit rates, bytecode and dispatch statistics as appropriate)
- [ ] #2 A findings document in docs/ ranks the causes by measured impact, with the evidence for each (profiles, counters, minimal reproductions) and an estimated effort and risk per fix
- [ ] #3 Each distinct cause that is worth fixing is created as its own backlog task ready for a Fable agent, with a reproduction and a benchmark to prove the fix; no maintainer approval is needed to create them, only micro-optimizations that barely move the needle are left out (listed in the findings document as skipped)
- [ ] #4 No engine behaviour or test262 baseline changes in this task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Maintainer direction (2026-11-08): adoption of the engine is not in doubt and performance gaps will be fixed over time, so the investigator creates the Fable fix tickets itself using judgement; skip only micro-optimizations that barely move the needle.
<!-- SECTION:NOTES:END -->
