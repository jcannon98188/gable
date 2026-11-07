---
id: TASK-56.13
title: 'Designer: MCP control plane for agents'
status: To Do
assignee: []
created_date: '2026-11-07T15:55:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the Designer to AI agents over MCP so an agent can drive it like a user: inspect state, navigate, select, edit, and verify. The control plane is a thin MCP server (stdio and/or localhost streamable HTTP, token-protected, bound to 127.0.0.1) over the same backend/shell operations the UI uses, so every edit stays a minimal source patch with undo (ADR 0001). Candidate tools: project/status; list components, scenes, routes; set mode and scenario; navigate route; list/create/resize frames and device env (dark, touch, reduced motion); select by ref/selector/pos; get selection, computed styles, signals and tree; edit ops (set text, classes via Tailwind model with breakpoint/state, insert/move/delete, bindings) returning the applied patch diff; undo/redo; get problems and HMR timeline; screenshot of a frame (image content). Reads are safe; writes return patches. Document in the README.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MCP server exposes read tools (status, components, scenes, routes, selection, tree, signals, problems, HMR) with typed schemas
- [ ] #2 Write tools (mode, scenario, route, frames/env, select, edit ops, undo/redo) go through the existing edit service and return the applied patch
- [ ] #3 Screenshot tool returns an image of a chosen frame
- [ ] #4 Localhost-only binding with a per-session token; refuses unauthenticated calls; documented in README with a client config example
- [ ] #5 Tests cover the tools against a fixture project; tsc, build and full vitest pass
<!-- AC:END -->
