---
id: TASK-7
title: Local install workflow for unpublished packages
status: To Do
assignee: []
created_date: '2026-11-06 03:23'
labels:
  - tooling
dependencies: []
priority: medium
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packages are not on npm, so examples/todomvc installs from npm-packed tarballs in vendor/ using a manual loop plus an overrides block so core and template-format resolve to the same tarballs. This is easy to get wrong and goes stale on every change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A root script builds, packs every publishable package, and refreshes tarballs for a target app directory
- [ ] #2 create-gable can scaffold a project that depends on those local tarballs (e.g. a --local flag)
- [ ] #3 examples/todomvc README uses the script
<!-- AC:END -->
