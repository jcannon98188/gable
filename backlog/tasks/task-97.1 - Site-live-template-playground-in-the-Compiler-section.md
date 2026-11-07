---
id: TASK-97.1
title: 'Site: live template playground in the Compiler section'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T20:29:00Z'
updated_date: '2026-11-07T20:38:00Z'
labels: []
dependencies: []
parent_task_id: TASK-97
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Visitors see 'no compiler' only as a diagram. Let them edit a template and see it render immediately, with the real template/expression errors (e.g. ternary not allowed) shown as they would appear.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A live component renders from an editable static html template with no build step in the page
- [x] #2 Real core template/expression errors are surfaced inline, not mocked
- [x] #3 Suggested edits and reset; a bad edit never breaks the page
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a live template playground to the Compiler section (site/src/demos/playground/). The textarea source is built into a component class at runtime (html strings array, no holes) and mounted with createComponent on the real DOM renderer into an isolated container with a fresh injector and collecting ErrorHandler. Parse errors (thrown) and binding errors (reported) show inline verbatim; the last good render stays visible. Suggested edits (3 working, 5 error-raising) and Reset; wrapped in gable-error-boundary. Verified: 6 jsdom tests pass, real browser check on vite :5201 (ternary error shown, last render kept, Reset). Unverified: 375px layout (preview viewport did not resize) and light theme visually. No language-service diagnostics: it needs a TypeScript program, so gable-check is not faked. Pre-existing failures from other tasks: extract-api test timeout, tsc errors in demos/data and demos/signals, gable-check errors in demos/router.
<!-- SECTION:FINAL_SUMMARY:END -->
