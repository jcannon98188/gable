---
kind: ticket
title: Local install workflow for unpublished packages
status: resolved
tags:
  - tooling
  - priority-medium
created: 2026-11-06
updated: 2026-11-06
imported_from: backlog/tasks/task-7 - Local-install-workflow-for-unpublished-packages.md
assignee:
  - '@claude'
priority: medium
ordinal: 48000
---

## Question

Packages are not on npm, so examples/todomvc installs from npm-packed tarballs in vendor/ using a manual loop plus an overrides block so core and template-format resolve to the same tarballs. This is easy to get wrong and goes stale on every change.

## Acceptance criteria

- [x] #1 A root script builds, packs every publishable package, and refreshes tarballs for a target app directory
- [x] #2 create-gable can scaffold a project that depends on those local tarballs (e.g. a --local flag)
- [x] #3 examples/todomvc README uses the script

## Implementation plan

1. scripts/pack-local.mjs: build, npm pack publishable packages into <app>/vendor, update app package.json deps+overrides. 2. create-gable --local <dir>: file: deps + overrides in scaffold; tests. 3. Update todomvc README and docs/manual-setup.md. 4. Verify end-to-end in temp dir.

## Implementation notes

Validation: npm run pack:local into a temp app rewrote deps/overrides; --no-update printed entries; create-gable --local scaffold from packed tarballs then npm install, npm run check and npm run build succeeded; npx vitest run packages/create-gable: 15 passed. examples/todomvc/package.json not rewritten (script would add overrides for all @gablejs/* packages).

## Answer

Added scripts/pack-local.mjs (npm run pack:local [app-dir] [--no-build] [--no-update]), create-gable --local <tarball-dir> (file: deps + overrides, with tests), and updated todomvc README and docs/manual-setup.md. Verified end-to-end in a temp dir and with vitest packages/create-gable (15 passed).
