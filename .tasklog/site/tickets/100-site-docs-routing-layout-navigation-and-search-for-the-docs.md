---
kind: ticket
title: "Site docs: routing, layout, navigation and search for the docs section"
status: resolved
tags:
  - parent-95
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-95.2 - Site-docs-routing-layout-navigation-and-search-for-the-docs-section.md
assignee:
  - '@claude'
ordinal: 177000
---

## Question

The site is a single page with no router. Docs need real routes that survive refresh and deep links on GitHub Pages (404.html copy), a docs layout with sidebar, on-page contents, theme support, and rendering of the generated reference.

## Acceptance criteria

- [x] #1 Router added to the site with the marketing page at / and docs under /docs/...; deep link and refresh work with the Pages base path
- [x] #2 Docs layout: sidebar by package, on-page headings, prev/next, light/dark, mobile nav
- [x] #3 Reference pages render the extractor JSON (signatures, params, examples) using ui-code-block
- [x] #4 Client-side search over guides and symbols

## Implementation notes

Routing: history mode (clean URLs, in-page # anchors for headings work, pages.yml already copies index.html to 404.html so deep links/refresh work under /gable/; drawback: 404 status on refresh). Code blocks: docs reuse the @gable/ui tokenizer (packages/ui/src/lib/highlight.ts) via a small doc-code component, since ui-code-block itself needs Tailwind. CI: no workflow change needed (npm run build runs the extractor). Not verified: mobile drawer in a real browser (preview viewport would not narrow); covered by mounted tests. Unrelated failing test: site/scripts api-cli test (site/99).

## Answer

Added router-based docs section under site/src/docs (shell, markdown renderer, guide/package/API pages, search, drawer, theme), history-mode routing with base support, Docs nav link, 22 mounted tests. Verified in browser: guide deep link, API index and symbol pages (encoded ids), search, dark toggle. Checks pass: site check, build with and without SITE_BASE, typecheck:tests.
