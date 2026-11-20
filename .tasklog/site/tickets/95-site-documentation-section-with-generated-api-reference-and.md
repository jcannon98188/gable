---
kind: ticket
title: "Site: documentation section with generated API reference and live demos"
status: open
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-95 - Site-documentation-section-with-generated-API-reference-and-live-demos.md
ordinal: 175000
---

## Question

The marketing site is one page. Visitors need a docs section covering every Gable library, its public API, how to use it, and runnable demos. API reference is generated from each package's exported declarations and TSDoc so it cannot drift; demos are live Gable components mounted in the page with their source beside them (an editable playground may follow later).

## Acceptance criteria

- [ ] #1 Docs routes exist under the site (overview, one page per package, reference per symbol) and deep links and refresh work on GitHub Pages
- [ ] #2 The API reference is generated at build time for every publishable package from its public exports and TSDoc
- [ ] #3 Every package has a guide page with install, usage and at least one live demo with source shown
- [ ] #4 Site tests, check (tsc + gable-check) and build pass
