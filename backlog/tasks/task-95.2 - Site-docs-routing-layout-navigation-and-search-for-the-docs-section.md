---
id: TASK-95.2
title: 'Site docs: routing, layout, navigation and search for the docs section'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T20:22:00Z'
updated_date: '2026-11-07T20:45:00Z'
labels: []
dependencies: []
parent_task_id: TASK-95
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The site is a single page with no router. Docs need real routes that survive refresh and deep links on GitHub Pages (404.html copy), a docs layout with sidebar, on-page contents, theme support, and rendering of the generated reference.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Router added to the site with the marketing page at / and docs under /docs/...; deep link and refresh work with the Pages base path
- [x] #2 Docs layout: sidebar by package, on-page headings, prev/next, light/dark, mobile nav
- [x] #3 Reference pages render the extractor JSON (signatures, params, examples) using ui-code-block
- [x] #4 Client-side search over guides and symbols
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Routing: history mode (clean URLs, in-page # anchors for headings work, pages.yml already copies index.html to 404.html so deep links/refresh work under /gable/; drawback: 404 status on refresh). Code blocks: docs reuse the @gable/ui tokenizer (packages/ui/src/lib/highlight.ts) via a small doc-code component, since ui-code-block itself needs Tailwind. CI: no workflow change needed (npm run build runs the extractor). Not verified: mobile drawer in a real browser (preview viewport would not narrow); covered by mounted tests. Unrelated failing test: site/scripts api-cli test (TASK-95.1).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added router-based docs section under site/src/docs (shell, markdown renderer, guide/package/API pages, search, drawer, theme), history-mode routing with base support, Docs nav link, 22 mounted tests. Verified in browser: guide deep link, API index and symbol pages (encoded ids), search, dark toggle. Checks pass: site check, build with and without SITE_BASE, typecheck:tests.
<!-- SECTION:FINAL_SUMMARY:END -->
