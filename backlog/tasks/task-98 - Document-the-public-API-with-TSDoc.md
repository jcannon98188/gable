---
id: TASK-98
title: Document the public API with TSDoc
status: Done
assignee: []
created_date: '2026-11-07T20:36:00Z'
updated_date: '2026-11-07T21:02:00Z'
labels: []
dependencies: []
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The new API reference (TASK-95.1) is generated from TSDoc, and about 30% of public symbols have none, so those entries show a signature and nothing else. The gaps include basics such as signal and computed in @gable/core. Counts from the first extraction run (undocumented / total): core 101/287, ui-primitives 87/167, ui 56/192, editor 25/65, store 10/54, testing 10/43, template-format 6/13, gable-ui 6/26, renderer-dom 5/12, language-service 5/9, vite 4/13, create-gable 3/7, prettier-plugin 2/2. designer, devtools-extension and vscode are not extracted yet because they have no exports or types field.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every public symbol in @gable/core has a TSDoc summary, with @example on the primary APIs (signal, computed, effect, bootstrap, inject, the component meta, forms, router, http, i18n)
- [x] #2 Every public symbol in the other extracted packages has a TSDoc summary; params and returns are described where the name and type do not already say it
- [x] #3 'node scripts/extract-api.mjs --strict' (run from site/) exits 0, and it runs in CI so new undocumented exports fail the build
- [x] #4 designer, devtools-extension and vscode have an exports or types entry point, or are explicitly documented as not having a public API
- [x] #5 Remarks and examples avoid raw HTML-like text that would render as markup; examples compile
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TSDoc added across core and 12 other packages; extractor reports 0 undocumented over 13 libraries. Strict gate (npm run api:strict -w site) runs in the Pages workflow before site tests. designer, devtools-extension and gable-vscode are skipped as applications with reasons. Verified: build, typecheck:tests, 1808 root tests, 88 site tests, site check and Pages-base build. Follow-ups: some internal-looking exports are not marked @internal; devtools TSDoc not cross-checked against consumers.
<!-- SECTION:FINAL_SUMMARY:END -->
