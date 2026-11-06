---
id: TASK-7
title: Local install workflow for unpublished packages
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:23'
updated_date: '2026-11-06 03:35'
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
- [x] #1 A root script builds, packs every publishable package, and refreshes tarballs for a target app directory
- [x] #2 create-gable can scaffold a project that depends on those local tarballs (e.g. a --local flag)
- [x] #3 examples/todomvc README uses the script
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scripts/pack-local.mjs: build, npm pack publishable packages into <app>/vendor, update app package.json deps+overrides. 2. create-gable --local <dir>: file: deps + overrides in scaffold; tests. 3. Update todomvc README and docs/manual-setup.md. 4. Verify end-to-end in temp dir.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: npm run pack:local into a temp app rewrote deps/overrides; --no-update printed entries; create-gable --local scaffold from packed tarballs then npm install, npm run check and npm run build succeeded; npx vitest run packages/create-gable: 15 passed. examples/todomvc/package.json not rewritten (script would add overrides for all @gable/* packages).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added scripts/pack-local.mjs (npm run pack:local [app-dir] [--no-build] [--no-update]), create-gable --local <tarball-dir> (file: deps + overrides, with tests), and updated todomvc README and docs/manual-setup.md. Verified end-to-end in a temp dir and with vitest packages/create-gable (15 passed).
<!-- SECTION:FINAL_SUMMARY:END -->
