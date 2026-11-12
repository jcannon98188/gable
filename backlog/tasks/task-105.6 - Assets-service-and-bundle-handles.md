---
id: TASK-105.6
title: Assets service and bundle handles
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T23:31:00Z'
labels: []
dependencies:
  - TASK-105.3
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 244000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.9: app-level Assets service with provideAssets({ bundles }), bundle handles with status, progress and error signals and idempotent load() and unload(), ref-counted bundle lifetime tied to the caller's scope via onCleanup (keepAlive opts out), strings in [texture] resolved synchronously from Pixi's cache with a dev warning when not loaded, spritesheets and fonts as plain bundle entries, node removal never destroys bundle textures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 inject(Assets).bundle(name) returns a handle with status, progress, error, load and unload
- [x] #2 [texture] strings resolve from Pixi's cache; a missing alias warns in dev naming the alias
- [x] #3 Bundles unload when the last loading scope is disposed unless keepAlive is set
- [x] #4 Spritesheet frame names and bitmap fonts work from bundle entries
- [x] #5 @if and @defer (when ...) over the handle's signals drive loading UI in a documented example
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the Assets service in packages/renderer-pixi: provideAssets({ bundles, backend? }) with an injectable AssetsBackend (default Pixi Assets); inject(Assets).bundle(name) returns a handle with status, progress, error, ready, load (ref-counted per scope, retry after failure) and unload; [texture] strings and static texture attributes resolve synchronously from Pixi's Cache on sprite, tiling-sprite and nine-slice-sprite with a dev warning and Texture.EMPTY on a miss; bundles unload when the last loading scope is disposed (keepAlive and out-of-scope loads are never auto-released). docs/canvas-assets.md documents the loading-UI pattern. Tests: assets.test.ts, textures.test.ts. Verified after merge (integration bd033f5): renderer-pixi 88/88, core 96/96; only the known failures remain (hmr-review.test.ts, renderer-dom browser.test.ts). Gaps: spritesheet frames and bitmap fonts are tested only against stand-ins (no real loader path); @defer (when ...) is documented but not tested (an @if over ready() is); a scope that disposes mid-load unloads once the load settles instead of cancelling.
<!-- SECTION:FINAL_SUMMARY:END -->
