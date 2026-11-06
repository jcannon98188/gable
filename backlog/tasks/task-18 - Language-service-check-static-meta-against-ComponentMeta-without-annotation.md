---
id: TASK-18
title: 'Language service: check static meta against ComponentMeta without annotation'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:58'
updated_date: '2026-11-06 04:04'
labels:
  - dx
  - language-service
dependencies: []
priority: medium
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TypeScript cannot enforce a type on a class's static side without a base class or decorators (both rejected by design), so a typo like selectr or imports: [NotAComponent] in static meta is only caught indirectly. A file rule in the template language service should check any class with a static meta field against ComponentMeta in the editor and in gable-check, with a quick fix that adds 'satisfies ComponentMeta'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A file rule (stable id, configurable severity like the others) reports unknown or mistyped keys and bad values in static meta, including imports entries that are not components or lazy() entries
- [x] #2 A quick fix adds 'satisfies ComponentMeta' (and the import) to the meta initialiser
- [x] #3 Covered by pass/fail fixtures and check.test.ts; examples and the create-gable template stay clean under gable-check
- [x] #4 Docs mention the rule and the manual satisfies ComponentMeta option
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New file rule component-meta (error by default) in meta-rules.ts: per static meta property, check keys and value types against ComponentMeta resolved from the program; per-entry check of imports; missing selector.
2. Skip metas already typed (annotation, satisfies/as).
3. Quick fixes: add 'satisfies ComponentMeta' + type import (ensureImport typeOnly), spelling fix for near-miss keys.
4. Fixtures meta-pass/meta-fail, tests in file-rules.test.ts incl. --fix run.
5. Docs in getting-started.md; verify examples and template stay clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: npx vitest run packages/language-service packages/create-gable (102 + 15 passed); gable-check clean on examples/todomvc, examples/js-framework-benchmark, create-gable template (template checked via a copy under examples/ so @gable/core resolved; injecting a selector typo in copies of template and todomvc produced component-meta errors). Not covered: value types inside nested providers/host entries beyond assignability; non-literal spread keys skip the missing-selector check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the component-meta file rule (packages/language-service/src/meta-rules.ts): checks static meta keys, value types, imports entries and missing selector against ComponentMeta, skipping already-typed metas. Quick fixes add 'satisfies ComponentMeta' with a type import and fix near-miss key spelling. Fixtures meta-pass/meta-fail and tests in file-rules.test.ts; docs in docs/getting-started.md. Verified with language-service and create-gable vitest runs and gable-check on the examples and template.
<!-- SECTION:FINAL_SUMMARY:END -->
