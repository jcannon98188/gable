---
id: TASK-105.7
title: 'Language service: per-template element maps with enforced typing'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:35:00Z'
labels: []
dependencies:
  - TASK-105.2
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The template language service is DOM-only today (packages/language-service/src/emit.ts uses HTMLElementTagNameMap) and unknown tags resolve to any. TASK-104.7 requires typing enforced for scene templates: a boundary meta.renderer implies the Pixi element map, scene components carry a marker, one TS element map from /elements is the source of truth with a conformance test, errors by default, dotted paths only for point-like axes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scene templates are type-checked against the Pixi element map: unknown tags, properties, wrong value types and event types are errors
- [x] #2 Dotted paths such as [scale.x] type-check only for point-like axes
- [x] #3 DOM templates are unchanged
- [x] #4 Completions work for scene tags and properties
- [x] #5 A conformance test ties the map to the shared table
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Language service now type-checks and completes scene templates: new element-map builder from the shared table in @gable/renderer-pixi/elements, marker 'elements: pixiElements' (or meta.renderer) makes a template a scene template, new rules scene-unknown-tag, scene-unknown-property, scene-attribute, scene-tag-in-dom appended to RULES, dotted-path and event typing, DOM templates unchanged, completions for tags, properties and events via real tsserver; additive 'elements?: unknown' on core ComponentMeta. Tests: scene.test.ts, scene-editor.test.ts, scene-conformance.test.ts (type-checks emitted declarations against real pixi.js types). Verified after merge (integration 2e875ad): language-service 172/172 with --testTimeout=120000 (9 tsserver tests timed out at the default 5s on first run, passed on rerun). Gaps: [a11y] not yet in the table (TASK-105.15 must add it); eventMode/cursor typed string, not Pixi's literal unions; shape tags outside graphics and text content under non-text tags are not checked.
<!-- SECTION:FINAL_SUMMARY:END -->
