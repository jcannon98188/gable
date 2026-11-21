---
kind: ticket
title: "Site docs: API extractor that emits per-package reference JSON"
status: resolved
tags:
  - parent-95
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-95.1 - Site-docs-API-extractor-that-emits-per-package-reference-JSON.md
assignee:
  - '@claude'
ordinal: 176000
---

## Question

The reference must be generated from the packages' public exports and TSDoc so it cannot drift. The site renders the JSON; the extractor owns its schema.

## Acceptance criteria

- [x] #1 A build script (site/scripts) reads each publishable package's entry points and exports, and emits site/src/generated/api/<package>.json plus an index
- [x] #2 Output covers classes, functions, interfaces, types, constants, with signatures, TSDoc summary/remarks/params/returns/examples, deprecations and the entry point (subpath) each symbol is exported from
- [x] #3 Handles every package's exports map (subpaths like @gablejs/core/rxjs, @gablejs/core/tooling) and reports undocumented public symbols
- [x] #4 Unit tests over a small fixture package; run as part of site build and check

## Answer

Added site/scripts/extract-api.mjs (TypeScript compiler API via @typescript/typescript6, since typescript@7 ships no JS API) which reads each workspace package's built .d.ts entry points from package.json exports/types and writes site/src/generated/api/<slug>.json plus index.json. Contract documented in site/src/generated/api-schema.ts. 13 packages covered (core 12 entry points, testing 3, ui-primitives 2); designer, devtools-extension, vscode skipped (no exports/types). 320 undocumented symbols reported (table on stdout, counts in index.json); --strict fails on them. 17 vitest tests over a fixture package (site/scripts/__fixtures__) pass; site vitest config includes scripts/**/*.test.ts. site scripts: api, dev/build/check run api first. site/src/generated/api/ is gitignored. Note: npm run check -w site currently fails on an unrelated error in src/hmr-demo/session.ts (another task).
