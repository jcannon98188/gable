---
id: TASK-100.1
title: 'Engine M0: workspace, engine interface, test262 runner and CI'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies: []
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Everything later is measured by test262 and built against the engine interface, so the runner, the CI matrix and the interface crate come first. Spec sections 7, 10 and 11.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cargo workspace under native/engine/ with the crates in spec section 10 builds on Windows, macOS and Linux in CI
- [ ] #2 gable-engine-api defines the engine interface (spec section 7) with a conformance test kit; the Rust API shapes are recorded in an ADR
- [ ] #3 A QuickJS-NG adapter passes the conformance kit
- [ ] #4 The test262 runner pins a commit, derives the ES2025 feature list, runs strict twice, applies the exclusions file (a missing reason is an error), reports per-directory pass rates and fails on regression against a checked-in baseline
- [ ] #5 CI runs the runner on three OSes for pull requests touching native/engine
<!-- AC:END -->
