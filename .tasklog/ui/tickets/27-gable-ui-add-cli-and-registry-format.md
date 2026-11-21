---
kind: ticket
title: gable-ui add CLI and registry format
status: resolved
blocked_by: [26]
tags:
  - ui
  - needs-info
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-27 - gable-ui-add-CLI-and-registry-format.md
assignee:
  - '@claude'
ordinal: 68000
---

## Question

Name decided: gable-ui. Shadcn-style distribution: a CLI that copies component source into the user project, plus a registry format that carries static meta components and Tailwind config. The registry format is deliberately deferred until a real release is planned, so this task is only a placeholder; do not start without the user.

## Acceptance criteria

- [x] #1 Registry format agreed with the user before implementation
- [x] #2 gable-ui add button copies the component and its dependencies into a project

## Implementation plan

1. New package packages/gable-ui (bin gable-ui), lockstep version, --local flag like create-gable.
2. Registry format: index.json + items/<name>.json (files with content, npm dependencies, registryDependencies, cssImports/cssVars/css). Build step generates it from packages/ui (registry-meta.ts if present, else import inference).
3. Sources: bundled dir, local dir (registry or ui source tree), git URL.
4. Commands: init, add <component...>, build. Config gable-ui.json. Rewrite relative imports to the user's dirs.
5. Unit + e2e tests (temp Vite fixture, offline), docs/gable-ui-cli.md.

## Implementation notes

User-approved decisions applied (CLI gable-ui, shadcn-style component registry, JSON index + per-item JSON, local dir or git URL source, gable-ui.json, init/add, no diff).

Implemented packages/gable-ui (CLI gable-ui: init, add, build), registry JSON (index.json + items/<name>.json), sources: bundled dir / local dir or ui source tree / git URL(#ref), --local, --no-install, --overwrite. Registry generated from packages/ui by 'gable-ui build' (registry-meta.ts read if present, otherwise inferred from imports; not present when implemented, shape assumed: registryMeta keyed by item name). Docs: docs/gable-ui-cli.md. Verified: npx vitest run packages/gable-ui (41 tests incl. offline init+add e2e into Vite fixtures), tsc. Not verified: real package-manager install, tsc of copied output against real node_modules.

Housekeeping: the @gablejs/ui vs gable-ui CLI tarball name collision (both gable-ui-<v>.tgz) is fixed in scripts/pack-local.mjs: vendorNames() stores the CLI as gable-ui-cli-<v>.tgz and throws on any other collision; test in packages/gable-ui/src/pack-names.test.ts; documented in docs/gable-ui-cli.md and docs/library-authors.md.

## Answer

Added the gable-ui CLI package (packages/gable-ui) with init/add/build, a JSON component registry format generated from packages/ui, gable-ui.json config, import rewriting to the user's directories, and docs/gable-ui-cli.md. 41 tests pass (unit + offline e2e); tsc clean. Follow-ups: package is private; npm tarball name gable-ui-<v>.tgz collides with @gablejs/ui in pack-local when published; registry-meta.ts shape is assumed.
