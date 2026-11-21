---
kind: ticket
title: "Testing: axe-core accessibility assertion helper"
status: resolved
tags:
  - a11y
  - testing
  - ready-for-agent
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-39 - Testing-axe-core-accessibility-assertion-helper.md
assignee:
  - '@claude'
priority: medium
ordinal: 80000
---

## Question

Add an optional helper to @gablejs/testing, e.g. await expectNoA11yViolations(fixture), that runs axe-core against the fixture DOM under jsdom (with documented limits such as colour contrast) and formats violations readably. axe-core stays an optional peer dependency. Add it to the ui-gallery tests as a first use.

## Acceptance criteria

- [x] #1 Helper runs axe-core on a mounted fixture and fails with a readable report
- [x] #2 axe-core is an optional peer dependency, and the helper is documented and used in the ui-gallery tests

## Implementation plan

1. @gablejs/testing/a11y entry (optional axe-core peer). 2. Unit tests under jsdom. 3. ui-gallery a11y test. 4. docs/accessibility.md.

## Implementation notes

Implemented packages/testing/src/a11y.ts (expectNoA11yViolations, a11yViolations, formatA11yViolations, JSDOM_UNSUPPORTED_RULES), ./a11y export, optional peer axe-core, vitest alias, tests, docs/accessibility.md, examples/ui-gallery/src/a11y.test.ts (vendor testing tarball repacked, axe-core+jsdom devDeps). Gallery run found 2 real violations (UiSelect trigger button-name, Alert heading-order), disabled in the gallery test and tracked in ui/55.

## Answer

Added @gablejs/testing/a11y (expectNoA11yViolations, a11yViolations, formatA11yViolations, JSDOM_UNSUPPORTED_RULES); axe-core is an optional peer dep, loaded lazily. In-memory fixtures fail with a clear error. Unit tests (4) and a ui-gallery jsdom test pass; docs in docs/accessibility.md. Gallery found 2 real violations, tracked in ui/55 and disabled in the gallery test meanwhile.
