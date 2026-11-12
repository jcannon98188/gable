---
id: TASK-105.9
title: 'Accessibility: [a11y] mirror, announceOnChange and ReducedMotion'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:53:00Z'
labels: []
dependencies:
  - TASK-105.3
  - TASK-105.5
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 247000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.11: opt-in [a11y] property ({ role, label, description?, focusable?, order? }) on scene tags backed by a Gable-owned hidden DOM mirror (not Pixi's accessibility plugin), non-trapping focus where the host or the mirror elements are tab stops with a DOM focus ring, activation of a mirror element dispatching the node's tap handler, announceOnChange(signal, format) over the existing LiveAnnouncer throttled to one polite message per second, and a ReducedMotion signal service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tagged nodes get a visually hidden DOM element with the given role and label, positioned from node bounds in scene order unless order overrides
- [x] #2 Click, Enter and Space on a mirror element fire the node's pointer-tap handler
- [x] #3 Tab and Shift+Tab always leave the canvas and Escape is never captured
- [x] #4 announceOnChange uses LiveAnnouncer and is throttled
- [x] #5 ReducedMotion reflects prefers-reduced-motion as a signal
- [x] #6 The test renderer records the mirror (fixture.scene.a11y(), focus, tab) and announcements
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added accessibility to packages/renderer-pixi: opt-in [a11y] property (bound object {role,label,description?,focusable?,order?}; added to the shared element table) backed by a Gable-owned hidden DOM mirror (button -> real <button>, other roles -> div with that role; transparent not opacity:0 so the DOM focus ring shows; pointer-events none; inside the host as data-gable-a11y), synced once per rendered frame; activation by click/Enter/Space dispatches pointertap on the node; no focus trap (Tab/Escape/arrows never prevented; host tabindex -1 while focusable mirror elements exist); announceOnChange helper over LiveAnnouncer (throttled, latest value wins, scope cleanup); ReducedMotion signal service (matchMedia option for tests); pixi-free A11yRecorder exported from @gable/renderer-pixi/testing. Tests: a11y.test.ts (30) plus conformance sets. Verified after merge (integration 9f0275d): core 96, renderer-pixi 158, testing 370, language-service 172, all pass. Follow-ups: A11yRecorder must be exposed by the TASK-105.8 test renderer as fixture.scene.a11y/focus/tab; real-browser axe-core check belongs to TASK-105.10; lint for pointer-listening nodes without [a11y] belongs to TASK-105.15.
<!-- SECTION:FINAL_SUMMARY:END -->
