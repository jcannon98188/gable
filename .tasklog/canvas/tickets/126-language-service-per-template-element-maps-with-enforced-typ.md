---
kind: ticket
title: "Language service: per-template element maps with enforced typing"
status: resolved
blocked_by: [121]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-105.7 - Language-service-per-template-element-maps-with-enforced-typing.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 245000
---

## Question

The template language service is DOM-only today (packages/language-service/src/emit.ts uses HTMLElementTagNameMap) and unknown tags resolve to any. canvas/112 requires typing enforced for scene templates: a boundary meta.renderer implies the Pixi element map, scene components carry a marker, one TS element map from /elements is the source of truth with a conformance test, errors by default, dotted paths only for point-like axes.

## Acceptance criteria

- [x] #1 Scene templates are type-checked against the Pixi element map: unknown tags, properties, wrong value types and event types are errors
- [x] #2 Dotted paths such as [scale.x] type-check only for point-like axes
- [x] #3 DOM templates are unchanged
- [x] #4 Completions work for scene tags and properties
- [x] #5 A conformance test ties the map to the shared table

## Answer

Language service now type-checks and completes scene templates: new element-map builder from the shared table in @gablejs/renderer-pixi/elements, marker 'elements: pixiElements' (or meta.renderer) makes a template a scene template, new rules scene-unknown-tag, scene-unknown-property, scene-attribute, scene-tag-in-dom appended to RULES, dotted-path and event typing, DOM templates unchanged, completions for tags, properties and events via real tsserver; additive 'elements?: unknown' on core ComponentMeta. Tests: scene.test.ts, scene-editor.test.ts, scene-conformance.test.ts (type-checks emitted declarations against real pixi.js types). Verified after merge (integration 2e875ad): language-service 172/172 with --testTimeout=120000 (9 tsserver tests timed out at the default 5s on first run, passed on rerun). Gaps: [a11y] not yet in the table (canvas/134 must add it); eventMode/cursor typed string, not Pixi's literal unions; shape tags outside graphics and text content under non-text tags are not checked.
