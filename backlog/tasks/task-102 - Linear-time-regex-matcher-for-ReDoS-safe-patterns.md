---
id: TASK-102
title: Linear-time regex matcher for ReDoS-safe patterns
status: To Do
assignee: []
created_date: '2026-11-09T02:03:00Z'
updated_date: '2026-11-09T02:07:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.10
references:
  - docs/adr/0013-regexp-matching-adopts-regress-behind-a-seam.md
  - docs/adr/0006-engine-interface-is-handle-based-and-host-driven.md
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backtracking regex engines have exponential worst cases (ReDoS): with regress, /(a+)+$/ on 28 a's and a '!' takes 14.9 s (ADR 0013). Every JS engine has this because ES semantics are defined by backtracking, but a safe, embeddable engine that is immune for the common case is a real selling point for AgniJS consumers running patterns on untrusted input. Add a linear-time matcher (Pike VM / Thompson NFA with ECMAScript leftmost-first priority, captures, case folding and Unicode modes) inside the gable-js-regex seam (ADR 0013), used for patterns without backreferences or lookaround; everything else stays on regress. Routing must be conservative: when unsure, use regress. Keep the engine Gable-agnostic (ADR 0016); crate rename is TASK-100.12. Suitable for an Opus or a Fable agent; the differential fuzzer against regress is the main safety net and is an acceptance criterion, not optional.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Eligible patterns (no backreferences, no lookaround) run on a linear-time matcher with time proportional to pattern size times input length; the 14.9 s /(a+)+$/ case and the other pathological patterns in ADR 0013 finish in milliseconds
- [ ] #2 A differential fuzzer compares the new matcher with regress on random eligible patterns and inputs across flags (i, m, s, u, v, y, g, d), including captures, named groups, empty matches and lastIndex behaviour, and runs a documented minimum number of cases in CI with zero mismatches
- [ ] #3 The existing RegExp test262 suites, the gable-js-regex tests and the gable and --precompile baselines show no regressions; ineligible patterns still use regress and the routing rule is documented and tested, including the conservative fallback
- [ ] #4 gable-js-bench has regex workloads showing the cost of the linear matcher against regress on ordinary patterns, and a step or size trigger keeps ordinary patterns on the faster matcher where that is safe; the choice is recorded in an ADR addendum to 0013
- [ ] #5 The linear matcher is ON by default and embedders can opt out: a per-engine or per-realm host option (auto by default, backtracking_only for V8-style behavior, set at creation time, not global) and a cargo feature that compiles the linear matcher out entirely; the mode never changes which strings match, only how, and the RegExp test262 suites and the differential tests are run in both modes in CI
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Model assignment (maintainer, 2026-11-08): implement with an Opus agent. Fable is reserved for performance work, the JIT and AOT.
<!-- SECTION:NOTES:END -->
