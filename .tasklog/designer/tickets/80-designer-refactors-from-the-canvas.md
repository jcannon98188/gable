---
kind: ticket
title: "Designer: refactors from the canvas"
status: resolved
tags:
  - needs-triage
  - parent-56
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-56.24 - Designer-refactors-from-the-canvas.md
assignee:
  - '@claude'
ordinal: 172000
---

## Question

Rename component (all uses and imports), extract repeated element into a shared component with props, find all uses of a class or component; as multi-file minimal patches with one undo step. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.

## Acceptance criteria

- [x] #1 Rename, extract-with-props and find-uses work and undo as one step
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass

## Implementation notes

Rename and find-uses are new (src/server/edit/refactor.ts); extract existed for static markup only, now takes props:true (plain signal reads become input.required, bound at the use). EditService gained findUses and a renameComponent op committed through #commitFiles (one history entry over every file). Backend: POST /api/refactor/uses. MCP: find_uses, rename_component, extract_component. Shell: Rename and Find uses dialogs (refactor-dialogs.ts), Inspector Structure buttons, palette commands, Extract dialog props checkbox. Canvas jump reuses nodeAt/selectNode: no protocol change, no new EventSource. Verification: tsc designer + tests clean; designer build; vitest packages/designer 254 pass; e2e/refactor-check.mjs all checks pass in headless Edge against test-fixtures/refactor-app. Full vitest runs showed one different unrelated timing flake each time (toast-stack, language-service plugin), each passing alone.

## Answer

Added Rename component, Find uses and Extract-with-props as multi-file minimal patches with one undo step, exposed over MCP (find_uses, rename_component, extract_component) and the shell (dialogs, Inspector, palette). Unit and MCP tests plus e2e/refactor-check.mjs in headless Edge. Limits: file keeps its name; strings/comments not renamed (counted in note); props are plain signal reads, typed unknown unless a built-in type. Not verified: a clean single full-vitest pass (each full run had one load-timing flake in an untouched test that passes alone).
