# 10. Precompiled code ships in a versioned container that is rejected on mismatch

Date: 2026-11-08

## Status

Accepted

## Context

The spec (`docs/js-engine-spec.md`, section 3) requires serialisable bytecode so production bundles can ship precompiled code, with a versioned format that is rejected on mismatch. Full serialisation of register bytecode is M7 work, but the engine-interface `compile`/`load` methods exist from M2 and need a wire shape that will not change when M7 lands.

## Decision

- **Container header first, payload second** (`gable-js-vm/src/engine.rs`): a `GBLC` magic, the format string (`gable-bc-1`), a kind byte (script or module), the script name and then the payload. The header is checked before any payload byte is interpreted, and a mismatch is a version error from `load`, never a crash.
- **M2 payload is the source text.** `compile` produces a container whose payload is the source; `load` recompiles it. This gives the host the final API and error behaviour now, and lets M7 swap the payload for serialised register bytecode behind the same header by bumping the format string.
- **The format string pins the compiler version**, not the engine release: any change to `Instr`, `CodeBlock` or the constant pool encoding changes the string. A container produced by a different compiler is rejected rather than reinterpreted.

## Consequences

- Hosts can integrate precompilation (bundling, caching) against the M2 engine; the only behavioural change in M7 is faster `load`.
- Two format strings will coexist briefly in M7 (source payload and bytecode payload) so caches produced before the switch keep loading; after one release the source payload is removed.
- The container does not carry a checksum; the host's bundle format is responsible for integrity.
