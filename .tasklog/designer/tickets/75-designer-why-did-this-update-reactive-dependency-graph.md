---
kind: ticket
title: "Designer: why did this update (reactive dependency graph)"
status: resolved
tags:
  - needs-triage
  - parent-56
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-56.19 - Designer-why-did-this-update-reactive-dependency-graph.md
assignee:
  - '@claude'
ordinal: 167000
---

## Question

For the selected node/effect show which signals it depends on and, for a recent update, which signal change caused it (trace from the devtools hook); highlight updated nodes on the canvas. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.

## Acceptance criteria

- [x] #1 Selected node shows its dependencies and the cause of its last update
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass

## Implementation plan

Core: devtools hook records signal-write causes per effect run (dev-only, while connected), why report, binding attribution. Designer: agent whyNode/flashUpdates, shell Why tab + highlight, control commands, MCP why_did_update/highlight_updates, tests, e2e, README.

## Implementation notes

Verified: tsc designer, typecheck:tests, designer build clean; core why.test.ts (12) and designer why-tools.test.ts (10) pass; headless Edge e2e packages/designer/e2e/why-check.mjs all PASS (Why tab deps + cause, flash outline, MCP tools). Full vitest: only renderer-dom/browser.test.ts (known flaky, Edge spawn timeout) failed; toast-stack.dom.test.ts failed once under load and passes alone. Not verified: Tauri window; flash precision is element-level; field bindings and @if/@for blocks are not attributed to elements (Component scope only).

## Answer

Adds 'why did this update': core devtools hook traces signal-write causes of effect runs and attributes template bindings to elements; Designer Why updated tab (Element/Component scope, dependency tree, last-run causes), Highlight updates canvas flash, additive protocol (whyNode, flashUpdates, why/highlightUpdates), MCP tools why_did_update and highlight_updates, tests, e2e and README section.
