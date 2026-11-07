---
id: TASK-100
title: Gable JS engine
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies: []
references:
  - docs/adr/0004-gable-native-owns-its-javascript-engine-in-rust.md
documentation:
  - docs/js-engine-spec.md
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable Native owns its JavaScript engine in Rust (ADR 0004) so hot update, host objects, GC and the debugger fit Gable, and one pure-Rust toolchain builds on macOS and Android. This is the parent of the engine implementation milestones M0 to M9; docs/js-engine-spec.md is the authoritative spec and each milestone task points at its sections.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every milestone task M0 to M9 is Done
- [ ] #2 The switch-over rule in section 11 of docs/js-engine-spec.md is evaluated and reported to the maintainer
<!-- AC:END -->
