---
kind: ticket
title: "Typecheck test files in CI: fix pre-existing test type errors"
status: resolved
tags:
  - tooling
  - priority-low
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-66 - Typecheck-test-files-in-CI-fix-pre-existing-test-type-errors.md
assignee:
  - '@claude'
priority: low
ordinal: 114000
---

## Question

No tsconfig covers *.test.ts. A scratch tsc over packages showed errors in testing/*.test.ts (ComponentClass meta, FieldBase<any> property access, fake-timer advance signature), core/devtools.test.ts, renderer-dom/route-transitions.test.ts, ui-primitives tabs/items-*.test.ts, and packages/vite/src/i18n/plugin.ts(161) 'environment'. Fix them and add a tsconfig.tests.json plus script.

## Implementation notes

Added tsconfig.test.json (paths map @gablejs/* to source), npm script typecheck:tests, CI step in .github/workflows/ci.yml. Fixed test type errors in core, renderer-dom, testing, vscode. REMAINING (owned by other work, CI step will fail until fixed): packages/ui 25 errors (toast.test.ts 'toast' possibly null; advanceTimers (ms)=>vi.advanceTimersByTimeAsync not void; in dialog/popover/select/tabs/toast/tooltip tests), packages/ui-primitives 4 (same advanceTimers pattern: items-select.proto, items-slots.proto x2, tabs.test), packages/language-service 2 (check.test.ts:197 it.each callback signature). Fix for advanceTimers: advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)). packages/vite i18n plugin.ts 'environment' error not in test config scope (non-test file) - not re-checked; build.test.ts was mid-edit by another agent.

Remaining 31 test type errors fixed (advanceTimers typing, toast null, check.test it.each); npm run typecheck:tests is clean.

## Answer

tsconfig.test.json plus npm run typecheck:tests, wired into CI before npm test; all test files typecheck.
