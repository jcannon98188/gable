---
id: TASK-104.3
title: What should a declarative game look like to author?
status: To Do
assignee: []
created_date: '2026-11-12T05:42:00Z'
updated_date: '2026-11-12T06:09:00Z'
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
