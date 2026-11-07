---
id: TASK-100.2
title: 'Engine M1: parser and AST'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T22:36:00Z'
updated_date: '2026-11-07T23:26:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.1
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The parser is the first piece of the engine and has no runtime dependencies; test262 has dedicated parse-positive and parse-negative tests. Spec section 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every in-scope parse-positive test262 test parses
- [ ] #2 Every in-scope parse-negative (early error) test is rejected with a located error
- [ ] #3 Annex B syntax (except IsHTMLDDA) is covered
- [ ] #4 The AST carries the source positions the debugger and source maps need
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. gable-js-parser: source positions (UTF-16 offset, line, column) and Span on every AST node; lexer with regex/template/ASI-aware tokenisation, numeric separators, Unicode escapes in identifiers, hashbang
2. AST (estree-shaped Rust enums) for scripts and modules, including classes with private names and static blocks, async/generator functions, destructuring, optional chaining, import attributes, decorators excluded
3. Recursive-descent parser with cover grammars (parenthesised expression / arrow parameters, object literal / assignment pattern), strict-mode tracking, contextual keywords (yield, await, let, async, of), ASI rules, Annex B (HTML comments, legacy octal, function-in-block, labelled functions, for-in initialisers)
4. Early errors: duplicate lexical declarations, strict reserved words, labels, break/continue targets, private name resolution, duplicate __proto__, module-level checks (duplicate exports, undefined export names)
5. Regular expression literal syntax validation via gable-js-regex pattern parser (syntax-only, flags u/v/d/g/i/m/s/y), including Annex B legacy grammar when not unicode
6. test262 runner gains a parse-only engine mode (--engine parse): positive tests must parse, negative phase=parse must fail with SyntaxError, harness files must parse; strict double run applies
7. Unit tests per parser module plus test262 language/ built-ins/ annexB/ parse pass under the parse engine; failures listed with reasons or fixed
<!-- SECTION:PLAN:END -->
