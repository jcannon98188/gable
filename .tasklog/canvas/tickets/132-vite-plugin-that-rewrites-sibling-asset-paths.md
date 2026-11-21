---
kind: ticket
title: Vite plugin that rewrites sibling asset paths
status: resolved
blocked_by: [125]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-105.13 - Vite-plugin-that-rewrites-sibling-asset-paths.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 251000
---

## Question

Spritesheet JSON and bitmap-font descriptors reference sibling files by relative path, which Vite hashing breaks, so canvas/114 put those families in public/. The rewrite plugin was deferred and is now release-blocking (canvas/117). It must not change the provideAssets manifest API.

## Acceptance criteria

- [x] #1 Hashed spritesheet and bitmap-font families load correctly in dev and in a production build
- [x] #2 No change to the manifest API
- [x] #3 Tested in the example app

## Answer

Added gableAssetFamilies() to @gablejs/vite (packages/vite/src/asset-families.ts): importing a descriptor with ?family returns a URL usable as a bundle entry src; in production siblings (spritesheet meta.image and related_multi_packs, bitmap-font file= pages) are emitted hashed and the descriptor is rewritten, honouring base; in dev nothing is rewritten. provideAssets is unchanged. Tests: asset-families.test.ts (7), fixture packages/vite/fixtures/assets-app. Verified after merge (integration 906041d): vite, core, renderer-pixi, testing 57/57 files, 621/621 tests. Gaps: no declare module '*?family' typing shipped; no real-browser Pixi load of a family; custom assetFileNames that splits directories breaks the sibling rewrite; example app is a Vite fixture because no example canvas app exists yet.
