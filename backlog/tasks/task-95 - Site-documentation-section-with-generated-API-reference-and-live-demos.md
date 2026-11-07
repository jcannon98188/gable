---
id: TASK-95
title: 'Site: documentation section with generated API reference and live demos'
status: To Do
assignee: []
created_date: '2026-11-07T20:22:00Z'
labels: []
dependencies: []
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The marketing site is one page. Visitors need a docs section covering every Gable library, its public API, how to use it, and runnable demos. API reference is generated from each package's exported declarations and TSDoc so it cannot drift; demos are live Gable components mounted in the page with their source beside them (an editable playground may follow later).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Docs routes exist under the site (overview, one page per package, reference per symbol) and deep links and refresh work on GitHub Pages
- [ ] #2 The API reference is generated at build time for every publishable package from its public exports and TSDoc
- [ ] #3 Every package has a guide page with install, usage and at least one live demo with source shown
- [ ] #4 Site tests, check (tsc + gable-check) and build pass
<!-- AC:END -->
