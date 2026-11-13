---
id: TASK-105.15
title: Lint for pointer-listening scene nodes without [a11y]
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T00:13:00Z'
labels: []
dependencies:
  - TASK-105.7
  - TASK-105.9
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.11 named this lint as a follow-up; TASK-104.12 made it release-blocking. It is a template language-service rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A rule with a stable id flags a scene node with a pointer listener and no [a11y]
- [x] #2 Severity is configurable like other rules
- [x] #3 Tests cover it
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the scene-pointer-a11y rule to the language service (packages/language-service/src/scene.ts, config.ts): flags scene nodes in scene templates (renderer boundary or marked scene component) that have a pointer-type listener (any SCENE_EVENTS event except wheel) and no [a11y] (static attribute or binding); reports on the tag name naming the first pointer event; component tags are never flagged. Default severity warn (does not fail gable-check); configurable to error (exit 1) or off through compilerOptions.plugins like the other rules. Tests: scene-a11y.test.ts (5, including the off case added at merge) with fixtures scene-a11y-fail, scene-a11y-off (error) and scene-a11y-disabled (off); scene-pass/scene-fail fixtures gained [a11y]. Verified after merge (integration d024005): root run of core, renderer-pixi, testing, language-service, renderer-dom, vite 87 files/993 tests pass (1 skipped).
<!-- SECTION:FINAL_SUMMARY:END -->
