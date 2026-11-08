# 13. RegExp matching adopts the `regress` backtracking engine behind a seam that owns the ECMAScript semantics

Date: 2026-11-08

## Status

Accepted

## Context

M1 validated regular expression *syntax* with our own grammar (ADR 0007) and left the matcher open: adopt an existing Rust engine or write one. The spec asks M5 for the full ES2025 RegExp built-in (named and duplicate named groups, lookbehind, `u` and `v` modes with property escapes and set operations, match indices, modifiers, sticky and global semantics, `RegExp.escape`) and for a recorded decision on the engine.

The candidates were `regex` (RE2-style automaton, linear time, but no backreferences or lookaround and a different syntax), `fancy-regex` (backtracking over `regex`, byte oriented, no UTF-16 semantics) and `regress` (a backtracking engine written to the ECMAScript grammar, with UTF-16 input, `u`/`v` modes, lookbehind, backreferences, named groups and property escapes). A homegrown matcher was costed at several weeks before it would pass test262's 2000 RegExp tests.

## Decision

- **`regress` is the matcher**, used through `gable-js-regex::Regex` (`compile`, `exec`, `exec_sticky`, `group_count`, `group_names`). Nothing outside that crate names `regress`; the VM's `builtins/regexp.rs` holds every ECMAScript algorithm (RegExpAlloc/Initialize, RegExpBuiltinExec with the `d` indices and duplicate-name `groups` rules, the `@@match`/`@@matchAll`/`@@replace`/`@@search`/`@@split` protocol, `RegExp.escape`, the string iterator) against the seam only.
- **The seam resolves what the engine does not.** Our grammar check runs first on the UTF-16 pattern (so literals, `new RegExp` and lone-surrogate patterns report the same errors). Capture-group names are read by the seam and *stripped* before the engine sees the pattern: `(?<name>` becomes `(` and `\k<name>` becomes the numbered references of every group with that name (duplicate names live in different alternatives, so at most one holds a capture and `(?:\1\2)` matches exactly the participating group). This gave correct duplicate-name backreferences and astral group names without the `u` flag, both of which `regress` got wrong, and keeps the backend replaceable by anything that matches numbered groups over UTF-16.
- **Sticky and global are VM concerns.** The engine only searches from an index; the VM implements `lastIndex`, the sticky start check, `AdvanceStringIndex` and the unicode-mode surrogate-pair alignment.
- **Compiled matchers are shared.** A per-VM cache keyed by (pattern, flags) means a literal in a loop body compiles once; a one-entry cache of the last input's UTF-16 form keeps global match/replace/split linear in the input length (without it a 200k-character global replace copied the input per match and took 51 s; it now takes 0.26 s).

## Measurements (release build, `test262 eval`)

| Workload | Time |
| --- | --- |
| `/a+b/` over 100k characters, ten times | 48 ms |
| 10k `exec` calls of `/\d{3}-\d{4}/` | 61 ms |
| `/^x+$/gm` match over 1M characters | 229 ms |
| 200k-character global replace | 263 ms |
| `/\p{Lu}+/u` over 100k characters | 44 ms |
| `/(a\|aa)+$/` on 30 a's and a `!` | 298 ms |
| `/(a+)+$/` on 28 a's and a `!` (catastrophic) | 14.9 s |

test262: the RegExp, RegExpStringIteratorPrototype, `language/literals/regexp`, Annex B RegExp and `String.prototype` directories run 3236/3245; the nine remaining failures are six eval-of-lone-surrogate tests (the lexer reads UTF-8, see below) and three tests that need Map or Date.

## Consequences

- Backtracking means pathological patterns are exponential, as in every production JavaScript engine without a linear fallback; the host's interrupt mechanism (ADR 0006) remains the guard for untrusted patterns. A linear-time fallback for patterns without backreferences or lookaround is a possible M9 addition behind the same seam.
- Replacing the engine touches one crate: the seam's contract is "find the leftmost match from an index over UTF-16 units with numbered captures".
- Patterns that reach eval with lone surrogates in the *source text* are lexed as UTF-8 and lose the surrogate; this is a parser-level limitation (not a RegExp one) tracked for the parser.
