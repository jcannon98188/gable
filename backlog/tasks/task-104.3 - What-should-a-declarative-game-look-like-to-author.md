---
id: TASK-104.3
title: What should a declarative game look like to author?
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T05:42:00Z'
updated_date: '2026-11-12T06:37:00Z'
labels:
  - wayfinder:prototype
dependencies: []
parent_task_id: TASK-104
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Raise the fidelity of the discussion: write a rough, throwaway artifact of a small 2D game (e.g. bouncing sprites with a score HUD, or a tiny shooter) as Gable components with static templates: scene tags (container, sprite, text, graphics), signal-bound properties, input events, a per-frame update hook, and a DOM HUD around the canvas. No real renderer needed (a fake that logs calls is fine). The artifact is for the human to react to: does the tag vocabulary feel right, where does per-frame state live, what feels too much or too little? Link the artifact from the ticket.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Library is now PixiJS 8 (TASK-104.4): the prototype should use Pixi-shaped scene tags (container, sprite, text, graphics) and properties.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T06:37:00Z

---

Resolved with the human against the runnable prototype on branch prototype/canvas-authoring (three variants of a Dodge game on real Pixi: A signals everywhere, B template + refs, C components + game service; README there has observations; screenshots in prototypes/canvas-authoring). Decisions: (1) default shape is C: each entity is a Gable component with its own signal-bound template, the scene template composes entities, services (GameState, World) coordinate them. (2) B's escape hatch is a supported fast path: write to Pixi nodes directly through template refs for high-count high-rate entities (particles, bullets, tile layers); TASK-104.6 may still make signal-bound properties cheaper. (3) Per-frame hook is explicit and injected: inject(Frame).onFrame((dt) => ...) as a field initialiser, unsubscribed with the component; no magic frame() lifecycle method in core. (4) Scene tags and property names mirror Pixi 1:1 (container, sprite, graphics, text; x, y, rotation, scale, tint, anchor); the prototype's shape/rectW/fill helpers were stand-ins, settled in TASK-104.7 and TASK-104.9. Core hacks the prototype needed (per-subtree renderer, createComponent parent scope and providers, destroy hook, frame seam via flushSync) feed TASK-104.5 and TASK-104.6. Pitfall seen in C: stale rocks hit the new run after Restart because removal lands after the frame's hooks.

---
<!-- COMMENTS:END -->
