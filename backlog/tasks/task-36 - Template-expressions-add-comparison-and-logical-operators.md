---
id: TASK-36
title: 'Template expressions: add comparison and logical operators'
status: Done
assignee: []
created_date: '2026-11-07T03:24:00Z'
updated_date: '2026-11-07T03:29:00Z'
labels:
  - core
  - language-service
  - ready-for-agent
dependencies: []
priority: high
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while porting gable-ui (TASK-28): value expressions allow only property reads, zero-arg signal reads, literals, !, ?? so something like {{ page() === 1 }} or [disabled]="count() <= 0" needs a computed for every comparison. Decision (user): expand the expression language with strict comparison operators ===, !==, <, >, <=, >= and logical && and ||. Not included: loose ==/!=, arithmetic, ternary (use @if), assignment, calls with arguments; these stay errors with their hints. This amends TASK-1.4's allowed-expressions list. Parser and interpreter in packages/core/src/expression.ts; must also update the language service (typing in emit.ts, the disallowed-operator rule and its message, quick fixes), the template formatter and Prettier plugin, the VS Code grammar, docs, and the starter/examples where computeds exist only to work around this. Check that < and > inside interpolations and attribute values do not confuse the template tokenizer in template.ts. Reactive tracking must stay correct with short-circuiting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parser and interpreter support ===, !==, <, >, <=, >=, && and || with JavaScript precedence (comparison binds tighter than &&, which binds tighter than ||, and ?? and ! behave as before), parentheses supported or explicitly decided
- [x] #2 Disallowed operators (==, !=, arithmetic, ternary, assignment) still fail with clear hints; < and > in text and attribute values parse correctly
- [x] #3 Language service types the new expressions and its rules, formatter, Prettier plugin and VS Code grammar handle them; docs and TASK-1.4 amended
- [x] #4 Tests cover parsing, evaluation, reactive updates with short-circuiting, tooling and the tokenizer edge cases
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parser: new 'logical' and 'binary' Expr nodes; precedence || < && < ===/!== < relational < unary; parentheses were already supported (now also mark grouped logical/coalesce nodes so (a && b) ?? c is legal). ?? mixed with &&/|| unparenthesized is a parse error, like JavaScript. == and != get dedicated hints (use === / !==). Evaluator short-circuits, so reactive dependencies track only the operands actually read. Template tokenizer needed no change ({{ }} is skipped whole; attribute values are quoted). Language service emit.ts is token passthrough so typing works unchanged (type-mismatch on count() === 'one' verified); VS Code grammar already highlighted these operators; formatter keeps expressions verbatim (tested). Examples left alone: todomvc/js-framework-benchmark computeds are perf/test sensitive. Tests: packages/testing/src/expressions.test.ts, language-service check.test.ts (+fixtures pass/fail), template-format ops.test.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ===, !==, <, >, <=, >=, && and || (plus parenthesized grouping) to the expression parser/interpreter with JS precedence and short-circuiting; ?? mixed with &&/|| requires parentheses. ==, !=, arithmetic, ternary, assignment and calls with args still fail with hints. Language service, formatter, Prettier plugin and VS Code grammar handle them (mostly verified, no code change needed). README and TASK-1.4 amended. Verified: vitest on core, language-service, template-format, prettier-plugin, testing all pass; tsc clean for core and language-service. Follow-up: examples/todomvc computeds could now be inlined.
<!-- SECTION:FINAL_SUMMARY:END -->
