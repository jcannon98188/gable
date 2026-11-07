---
id: TASK-66
title: 'Typecheck test files in CI: fix pre-existing test type errors'
status: To Do
assignee: []
created_date: '2026-11-07T05:01:00Z'
labels:
  - tooling
dependencies: []
priority: low
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No tsconfig covers *.test.ts. A scratch tsc over packages showed errors in testing/*.test.ts (ComponentClass meta, FieldBase<any> property access, fake-timer advance signature), core/devtools.test.ts, renderer-dom/route-transitions.test.ts, ui-primitives tabs/items-*.test.ts, and packages/vite/src/i18n/plugin.ts(161) 'environment'. Fix them and add a tsconfig.tests.json plus script.
<!-- SECTION:DESCRIPTION:END -->
