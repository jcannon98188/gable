---
id: TASK-95.1
title: 'Site docs: API extractor that emits per-package reference JSON'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T20:22:00Z'
updated_date: '2026-11-07T20:32:00Z'
labels: []
dependencies: []
parent_task_id: TASK-95
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reference must be generated from the packages' public exports and TSDoc so it cannot drift. The site renders the JSON; the extractor owns its schema.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A build script (site/scripts) reads each publishable package's entry points and exports, and emits site/src/generated/api/<package>.json plus an index
- [x] #2 Output covers classes, functions, interfaces, types, constants, with signatures, TSDoc summary/remarks/params/returns/examples, deprecations and the entry point (subpath) each symbol is exported from
- [x] #3 Handles every package's exports map (subpaths like @gable/core/rxjs, @gable/core/tooling) and reports undocumented public symbols
- [x] #4 Unit tests over a small fixture package; run as part of site build and check
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added site/scripts/extract-api.mjs (TypeScript compiler API via @typescript/typescript6, since typescript@7 ships no JS API) which reads each workspace package's built .d.ts entry points from package.json exports/types and writes site/src/generated/api/<slug>.json plus index.json. Contract documented in site/src/generated/api-schema.ts. 13 packages covered (core 12 entry points, testing 3, ui-primitives 2); designer, devtools-extension, vscode skipped (no exports/types). 320 undocumented symbols reported (table on stdout, counts in index.json); --strict fails on them. 17 vitest tests over a fixture package (site/scripts/__fixtures__) pass; site vitest config includes scripts/**/*.test.ts. site scripts: api, dev/build/check run api first. site/src/generated/api/ is gitignored. Note: npm run check -w site currently fails on an unrelated error in src/hmr-demo/session.ts (another task).
<!-- SECTION:FINAL_SUMMARY:END -->
