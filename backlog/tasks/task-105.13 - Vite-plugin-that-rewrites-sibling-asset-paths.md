---
id: TASK-105.13
title: Vite plugin that rewrites sibling asset paths
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:40:00Z'
labels: []
dependencies:
  - TASK-105.6
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 251000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spritesheet JSON and bitmap-font descriptors reference sibling files by relative path, which Vite hashing breaks, so TASK-104.9 put those families in public/. The rewrite plugin was deferred and is now release-blocking (TASK-104.12). It must not change the provideAssets manifest API.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hashed spritesheet and bitmap-font families load correctly in dev and in a production build
- [x] #2 No change to the manifest API
- [x] #3 Tested in the example app
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added gableAssetFamilies() to @gable/vite (packages/vite/src/asset-families.ts): importing a descriptor with ?family returns a URL usable as a bundle entry src; in production siblings (spritesheet meta.image and related_multi_packs, bitmap-font file= pages) are emitted hashed and the descriptor is rewritten, honouring base; in dev nothing is rewritten. provideAssets is unchanged. Tests: asset-families.test.ts (7), fixture packages/vite/fixtures/assets-app. Verified after merge (integration 906041d): vite, core, renderer-pixi, testing 57/57 files, 621/621 tests. Gaps: no declare module '*?family' typing shipped; no real-browser Pixi load of a family; custom assetFileNames that splits directories breaks the sibling rewrite; example app is a Vite fixture because no example canvas app exists yet.
<!-- SECTION:FINAL_SUMMARY:END -->
