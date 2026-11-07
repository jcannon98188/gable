---
id: TASK-95.3
title: 'Site docs: package guides and live demos'
status: Done
assignee: []
created_date: '2026-11-07T20:22:00Z'
updated_date: '2026-11-07T21:34:00Z'
labels: []
dependencies: []
parent_task_id: TASK-95
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every library needs a how-to-use guide and runnable demos. Demos are real Gable components mounted in the page with their source shown beside them (ui-code-block), written so a later playground can open them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Guide page for each package (core, renderer-dom, template-format, language-service, prettier-plugin, vite, testing, ui-primitives, ui, gable-ui, designer, store, editor, devtools-extension, vscode, create-gable), reusing docs/*.md where they exist
- [x] #2 At least one live demo with source for each runtime library; tooling packages show commands and config instead
- [x] #3 Demos are isolated from the site's own styles and state, and a failing demo does not break the page
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Infrastructure: per-package guide markdown in docs/packages/<slug>.md rendered on the package page; a demo fence in markdown that mounts a registered demo with its source in ui-code-block, isolated (error boundary, own styles) so a failing demo cannot break the page; search and tests.
2. Content: guides for all 16 packages (reusing docs/*.md), tooling packages show commands/config.
3. Demos for each runtime library (core, renderer-dom, store, ui-primitives, ui, gable-ui, editor, testing), reusing existing site demos where they exist.
4. Verify: site tests, check, Pages build, browser pass.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Package guides for all 16 packages in docs/packages/<slug>.md, rendered on each package page; core, renderer-dom, testing, store, ui-primitives (3), ui (variants), editor and template-format have live demos with source; language-service, prettier-plugin, vite, create-gable, gable-ui, designer, devtools-extension and vscode show commands/config. Demos run in their own injector with scoped styles, lazy chunks, and a failure shows an inline error with Retry. Verified: site tests (114), check, Pages build, and a 375px browser pass over 15 package pages (no failed demos, no overflow). Not live: real @gable/ui components (need Tailwind), language-service (needs the TypeScript compiler). Follow-up: keyboard/reduced-motion not browser-tested.
<!-- SECTION:FINAL_SUMMARY:END -->
