---
id: TASK-96
title: 'Site: live HMR demo that proves state survives an edit'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T20:27:00Z'
updated_date: '2026-11-07T20:46:00Z'
labels: []
dependencies: []
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The HMR section of the marketing page only describes the behaviour (a static before/after box). The site is itself a Gable app, so it can run the real HMR runtime in the page: a live component with state, an editable source pane, and a Save that swaps the class in place while the state is kept. This turns the claim into something a visitor can do.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A live Counter-style component runs in the page; visitors change its state, edit its source (template, computed, added field) and Save, and the state persists across the swap using the real @gable/core/hmr applyUpdate
- [x] #2 One-click suggested edits plus free editing; a broken edit shows an error and leaves the running component untouched (rollback)
- [x] #3 Shows what carried over: fields transferred by name and kind, new fields initialised, removed fields dropped; Reset restores the original source
- [x] #4 Production site build keeps this working (dev hooks enabled for the site bundle), site tests/check/build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. DemoSession over real applyUpdate/registerModule. 2. HmrDemo lazy component with suggested edits, diff, readout. 3. Override __GABLE_DEV__ for site build. 4. Tests, browser check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a live HMR demo to the site HMR section: site/src/hmr-demo/{session,source,demo}.ts + demo.css, hmr.ts reworked (copy kept, demo lazy via @defer on viewport inside an ErrorBoundary). The visitor's source (plain JS) is evaluated with new Function and applied with the real @gable/core/hmr applyUpdate; readout derived from live instances plus the devtools hmrLog. vite.config.ts re-enables __GABLE_DEV__ for the build (site-keep-dev-hooks plugin). 15 new tests in hmr-demo/demo.test.ts; site tests, check (own files), builds, typecheck:tests pass. Verified in a real browser on dev server and vite preview build: count stays 7 across each edit, rollback on both break edits, dark/light. Not verified: mobile width visually, keyboard-only walkthrough, prefers-reduced-motion. Cost: dev code in main bundle (+~2.6 kB gzip main, more in shared chunk), demo chunk 8.4 kB gzip.
<!-- SECTION:FINAL_SUMMARY:END -->
