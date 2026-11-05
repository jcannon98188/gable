---
id: TASK-1.8
title: Dev server and bundler strategy
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 05:38'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.2
parent_task_id: TASK-1
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Do we ship our own dev server or integrate through a general-purpose bundler plugin (e.g. Vite)? How does production bundling work, and how does HMR hook in without the tool understanding gable's templates?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 05:28
---
From HMR runtime: (1) production output must contain no HMR code (registry, instance tracking, runtime behind a dev-only gate that the bundler dead-code-eliminates). (2) Every module exporting a registered component or service must be a self-accepting boundary; decide whether modules write import.meta.hot.accept literally or the dev server injects it. (3) Atomic batch updates, with import.meta.hot.invalidate() as the full-reload fallback.
---

created: 2026-11-05 05:38
---
Resolved with the user.

**Dev server and bundler**: gable ships no dev server or bundler. v0 is Vite-only, through a thin @gable/vite plugin that uses only standard plugin hooks and never parses templates or metadata. Other bundlers are out of scope for v0.
**Accept boundaries**: in dev only, the plugin appends one line to each module that imports from gable: import.meta.hot?.accept(m => __gableHmr.update(import.meta.url, m)). The runtime reads the new module namespace and finds registered classes there; the export name gives the stable id (module URL + export name), so no static analysis. Modules with no registered class fall through to Vite's normal bubbling. The entry module still triggers a full reload.
**Production**: Rollup via Vite with zero gable transforms in build mode. The HMR runtime is a separate package entry behind an import.meta.hot guard; the core holds only a tiny dev hook that dead-code-eliminates. A production-bundle test asserts no HMR code.
**TypeScript transpile**: the plugin forces esbuild target es2022 and useDefineForClassFields: true, no decorators, no emitDecoratorMetadata (field-initialiser setup depends on native class fields). It fails fast with a clear message when the user's tsconfig conflicts.
**Tailwind (first-class)**: Tailwind v4 via the official @tailwindcss/vite plugin, composed beside @gable/vite; gable's plugin has no Tailwind code. Tailwind scans source as text, so literal utility classes in html templates work with zero config. The global stylesheet is imported in the entry and is unscoped; Vite's CSS HMR updates it. Tailwind is the scaffold default.
**Styles**: styles are plain strings in static meta, passed to registerStyles. For Tailwind @apply/theme use in scoped styles, author a .css file imported with ?inline (with @reference to the global stylesheet); Vite + Tailwind process it and the renderer scopes it. Inline template-literal styles are never Tailwind-processed. A style-only edit is classified by the class diff as an in-place registerStyles patch, no view rebuild.
**Known limit**: a template edit adding a new utility class yields two independent updates (gable's template swap and Tailwind's CSS regeneration); they are not coordinated, so a transient unstyled frame is possible in dev.
**Handed to the template language service**: warn on non-literal class fragments in class bindings (Tailwind cannot see runtime-assembled names).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Vite-only via thin @gable/vite plugin (dev-only accept injection, no template parsing); zero gable transforms in production; esbuild forced to native class fields; Tailwind v4 composed as a separate plugin and first-class; scoped Tailwind styles via ?inline CSS files.
<!-- SECTION:FINAL_SUMMARY:END -->
