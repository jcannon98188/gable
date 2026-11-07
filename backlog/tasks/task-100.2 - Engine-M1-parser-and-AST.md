---
id: TASK-100.2
title: 'Engine M1: parser and AST'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.1
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The parser is the first piece of the engine and has no runtime dependencies; test262 has dedicated parse-positive and parse-negative tests. Spec section 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every in-scope parse-positive test262 test parses
- [ ] #2 Every in-scope parse-negative (early error) test is rejected with a located error
- [ ] #3 Annex B syntax (except IsHTMLDDA) is covered
- [ ] #4 The AST carries the source positions the debugger and source maps need
<!-- AC:END -->
