---
id: TASK-99.10
title: Engine design prior art and test262 mechanics
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T22:02:00Z'
updated_date: '2026-11-07T22:07:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-99
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Gable Native will own its JavaScript engine, written in Rust, behind an engine interface; an adopted engine (QuickJS-NG first, Boa as the pure-Rust alternative) runs in the interim. What does the prior art say a from-scratch engine must decide: bytecode and interpreter design, object model and shapes, garbage collection, performance without a JIT, host-object and embedding APIs, inspector and debugging support, and hot-update hooks? How do Rust engines (Boa, Nova, others) approach these, what are their conformance and performance results, and how is test262 run with feature filtering (ES2025 edition, staging, Annex B, intl402, harness and runner options)? Facts and comparison only, no decision.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T22:07:00Z

---

Research resolved. Findings on branch `research/js-engine-design-and-test262` (research/js-engine-design-and-test262.md). Rust engines: Boa uses a register-based bytecode VM, a shape transition tree and a mark-sweep GC, 96.0% of 53,578 test262 tests (about 98.3% on the es16 row), no inspector; Nova uses a stack bytecode interpreter and a data-oriented arena heap with a compacting GC and explicit rooting, about 80% test262; Brimstone has an Ignition-style bytecode VM and a compacting GC, over 97% on language tests, no SharedArrayBuffer or Atomics. No-JIT prior art: Ignition, Hermes fixed operand widths and compile-time scope slots, JSC LLInt, QuickJS stack bytecode with refcounting plus a cycle pass. Object models: V8 hidden classes, JSC structures, Boa shapes. Debugging: no Rust engine has an inspector or documented HMR API; CDP Debugger.setScriptSource is deprecated. test262: features.txt has 199 entries with no edition field, so an ES2025 cut needs a pinned commit plus feature lists; strict mode runs each test twice; test/staging does not count towards Stage 4; runners offer feature include and exclude lists and Boa pins a commit with an ignore config. Gaps: no extractable benchmark numbers, Annex B text and HostPromiseRejectionTracker not retrieved, Nova runner and Boa inline-caching details undocumented. The agent found a Kiesel README containing text instructing the reader to write a poem and ignored it.

---
<!-- COMMENTS:END -->
