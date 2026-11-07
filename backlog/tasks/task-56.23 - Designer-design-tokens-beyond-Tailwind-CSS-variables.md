---
id: TASK-56.23
title: 'Designer: design tokens beyond Tailwind (CSS variables)'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T18:55:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read CSS custom properties (light/dark pairs and overrides) from the project's stylesheets; Style panel edits the token not a one-off value, shows where a token is used and counts uses. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Token list with light/dark values; edit a token through the edit service; usage count and jump
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Audit: nothing reads CSS custom properties today; setCss (edit/css.ts) edits the last rule with a selector and cannot target :root inside @media or @theme; Tailwind mode covers classes only.
1. src/server/tokens/: css-scan.ts (lossless scanner: blocks with their at-rule/selector chain, declarations with offsets, @imports), model.ts (project stylesheets plus package stylesheets they @import, read-only; cascade order through imports; light/dark/variant/scoped classification; winners and overrides; usage index over CSS var() and templates: style attrs and classes via the Tailwind design system; aliases followed), patch.ts (minimal patch of one custom property in one exact context; append the context when missing; expect-value stale check), api.ts (/api/tokens/list|usages|element).
2. Additive EditOp setToken handled by EditService (one undo history); package tokens are edited as an override in the importing project stylesheet.
3. MCP: list_tokens, get_token_usages, set_token in mcp/token-tools.ts, registered from control.ts.
4. Shell: TokensState + Tokens tab (list with light/dark swatches and values, inline edit, usage count, usages with jump: template uses select the element, CSS uses select the first element matching the rule) and a Tokens section in the Style tab for the selected element's tokens.
5. Tests (scanner, patch, model, service undo, MCP), README section, fixture tokens-app (gable-ui theme.css + own light/dark/data-theme overrides) and e2e/tokens-check.mjs driving headless Edge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned. Server: src/server/tokens/{types,css-scan,patch,model,api}.ts; additive EditOp setToken in EditService (#token: .css inside the project only, CRLF kept, stale check via expect, noop when equal); backend.ts forwards /api/tokens/* (2 lines); MCP list_tokens/get_token_usages/set_token in mcp/token-tools.ts, registered from control.ts (1 call).
Shell: tokens-state.ts (root-scoped) and tokens-panel.ts (Tokens tab + ElementTokens section, also in the Style tab), tokens.css. Small edits: shell.ts (tab), tailwind-panel.ts (section), edit-state.ts (a .css edit no longer clears the selected element's model).
Decisions: package stylesheets (@gable/ui/theme.css) are read-only and edited as an override in the importing project stylesheet (later in the cascade, theme.css untouched). Dark edit of a token without a dark value goes to the project's most used dark context; refused with a reason for @theme inline tokens. @theme inline tokens get their uses by name (text-brand for --color-brand) because Tailwind inlines their value.
Found while driving the e2e: the shell already held 5 EventSource connections; a 6th (mine) hit the browser's 6-per-host HTTP/1.1 limit and every later fetch stalled. TokensState opens none; it follows the signals the existing streams set (edit history, Tailwind info, scene files).
Sanity run on examples/ui-gallery: 59 tokens, index in ~180 ms (cached 2 ms), --muted-foreground 47 uses via classes.

Verification: npx tsc -p packages/designer/tsconfig.json --noEmit clean; npm run typecheck:tests clean; npm run build -w packages/designer ok; npx vitest run: 180/181 files, 1611/1612 tests, the one failure renderer-dom/browser.test.ts (known flake) failed once more alone, then passed alone; src/tokens.test.ts 13 tests. e2e/tokens-check.mjs (headless Edge, CDP, tokens-app fixture): all 33 checks pass on two consecutive runs; fixture byte-identical afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Design tokens in the Designer. The backend reads CSS custom properties from the project's stylesheets and the package stylesheets they @import (gable-ui theme.css, read-only), keeping each definition's exact context (:root, .dark, prefers-color-scheme dark, [data-theme], @theme, component scopes), resolving light/dark winners, overrides and aliases, and indexing uses (CSS var(), template style attrs, classes through the Tailwind design system). A new Tokens tab shows light/dark values with swatches, edits a value in place through the additive setToken edit op (one minimal patch in one context, stale check, undo/redo/toast like every edit; package tokens become an override in the importing stylesheet), counts uses, lists them and jumps to the element; the Style tab lists the selected element's tokens. MCP: list_tokens, get_token_usages, set_token. README section added. Tests: src/tokens.test.ts (scanner, patch, classification, index, edit service with undo, MCP) and e2e/tokens-check.mjs (headless Edge). Risks/follow-ups: no colour picker (values are typed, oklch-safe); uses are counted in project sources only (not inside package components); @theme inline uses are matched by class name; the shell's per-state EventSource pattern is at the browser's 6-connection limit (a shared event stream in DesignerState would remove that trap); nested-rule definitions are edited in code only.
<!-- SECTION:FINAL_SUMMARY:END -->
