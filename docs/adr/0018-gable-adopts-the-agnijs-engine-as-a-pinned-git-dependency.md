# 18. Gable adopts the AgniJS engine as a pinned git dependency

Date: 2026-11-09

## Status

Accepted

## Context

ADR 0004 decided that Gable Native owns its JavaScript engine, written in Rust, behind an engine interface, with QuickJS-NG as the interim engine until a test262 gate was met. That gate is met: the engine passes test262 (42225 of 42225 in scope, also when every script and module runs from bytecode) and the intl402 suite, passes Gable's own suites, and the M9 report (`docs/js-engine-switch-over.md`) records the switch-over decision and the performance gap that remains. The engine was built inside this repository as `native/engine` with the boundary of the former ADR 0016 (nothing in it depends on Gable) so it could leave. It is valuable on its own as an embeddable, pure-Rust, test262-complete engine, and its roadmap (JIT tiers, snapshots, embedding API) is not Gable's.

## Decision

The engine lives in its own repository, [agnijs-rs/agnijs](https://github.com/agnijs-rs/agnijs), under MIT OR Apache-2.0, with the full history of `native/engine` (a `git subtree split`). Its crates were renamed `gable-*` to `agnijs-*` in the move (TASK-100.12). Engine code, tickets, the spec, the engine ADRs (0006 to 0017, numbers kept), performance findings, benchmarks, test262 setup and engine CI are there.

Gable consumes it as a git dependency pinned by revision in `native/engine-harness/Cargo.toml` (and so in its `Cargo.lock`); moving the pin is an explicit commit. The AgniJS engine is now the default engine of Gable Native. QuickJS-NG stays selectable behind the same engine interface for the one-release overlap and is then removed. Gable keeps the harness and the adapter code on its side of `agnijs-engine-api`, its own suites and benchmarks, and the switch-over report as evidence.

## Consequences

- Engine changes that Gable needs are made in the agnijs repository and picked up by moving the pinned revision here; the engine CI there, not Gable's, gates test262, GC stress, Miri and sanitizers. Gable's `engine-suites` workflow gates Gable's own suites against the pinned engine.
- The engine must stay Gable-agnostic (ADR 0016, enforced by the boundary tests in the agnijs repository). Gable-specific needs enter through the engine interface as embedder-neutral capabilities.
- ADR numbers are shared between the two repositories and not reused. [docs/adr/README.md](README.md) links each moved ADR.
- A pinned git dependency needs network access to GitHub at build time. Publishing the crates is a later, separate decision for the agnijs repository.
