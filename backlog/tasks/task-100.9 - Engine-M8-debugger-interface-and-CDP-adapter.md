---
id: TASK-100.9
title: 'Engine M8: debugger interface and CDP adapter'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T22:37:00Z'
updated_date: '2026-11-09T00:15:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.8
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable tooling needs breakpoints and stepping in the owned engine; the adopted engines have none. Spec section 9.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Breakpoints, stepping, frame and scope inspection, async stacks and script source work through the debugger interface
- [ ] #2 A separate CDP adapter crate supports console, source-mapped exceptions, breakpoints, stepping and evaluate, verified with a CDP client test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Test seams (chosen without user review, recorded here):
- Seam A, the debugger interface: gable_js_debugger::{Debuggee, DebugClient} as implemented by gable_js_vm::Vm, driven by a scripted test client in gable-js-vm/tests/debugger.rs. Catches breakpoints, stepping, frames, scopes, async stacks, script source, evaluate on a frame. Misses the wire protocol.
- Seam B, the CDP adapter over its real transport: gable-js-cdp/tests/cdp_client.rs connects a WebSocket CDP client over TCP to the adapter's server (HTTP /json/list then WebSocket upgrade) and drives Runtime/Debugger/console methods. Catches protocol shape, transport framing, pause message loop, source-mapped exception text. Misses DevTools UI quirks (checked manually with Node's built-in WebSocket client).
- Seam C, source maps: gable_js_debugger::SourceMap decode/lookup against worked-example mappings.

Implementation:
1. Compiler: per-CodeBlock debug info (statement-start pcs, register locals with pc ranges); serialise it; bump bytecode tag to gable-bc-3 (ADR 0010 addendum).
2. gable-js-debugger: engine-neutral interface (ScriptId, Location, BreakpointSpec, StepAction, PauseReason, FrameInfo, ScopeInfo, PropertyInfo, ValueDescription, AsyncStackTrace, Debuggee: Engine, DebugClient), source-map decoder.
3. gable-js-vm: Option<Box<DebugState>> on Vm; one extra flag in the dispatch-loop slow-path condition; script registry, breakpoints keyed by (code, pc), stepping by frame depth at statement starts, pause on debugger statement/exceptions/requests, frame and scope inspection, evaluate on frame via a temporary environment holding register locals, async stack capture at reaction registration when enabled, console and uncaught-exception notifications.
4. gable-js-cdp: transport-agnostic session (Runtime, Debugger, console, exceptions, source-mapped stack text, scriptParsed with sourceMapURL), WebSocket+HTTP server with handwritten RFC 6455 framing (no new deps), nested pause loop.
5. ADR 0017 for the debugger interface; verify cargo test --workspace --locked, boundary tests, test262 baselines (plain, --precompile, --only-intl402) and dispatch-loop perf with no debugger.
<!-- SECTION:PLAN:END -->
