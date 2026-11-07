---
id: TASK-56.6
title: 'Designer: Tailwind mode'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:58:00Z'
updated_date: '2026-11-07T06:24:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.4
  - TASK-56.5
parent_task_id: TASK-56
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable is Tailwind-friendly, and in Tailwind projects the class list is the design. A mode driven by the project real Tailwind design system makes design choices accurate for custom themes and plugins.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tailwind v4 design system is loaded from the project, with a documented fallback if the loader API changes
- [x] #2 Style panels draw scales (spacing, color, type, radius, shadow) from the project theme
- [x] #3 Edits change static class tokens only, replacing conflicting classes by comparing the CSS properties they set
- [x] #4 The selected frame chooses the breakpoint prefix, and the panel shows inherited versus overridden values
- [x] #5 A state toolbar edits hover, focus, disabled, group and dark variants, with forced-state preview (CDP on WebView2, injected rule elsewhere)
- [x] #6 Searchable class palette with live hover preview and autocomplete for typed classes
- [x] #7 Inserted class order matches the repo formatter or prettier plugin
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend src/server/tailwind: loader (find the project's Tailwind CSS entry; load its design system through the PROJECT's own @tailwindcss/node __unstable__loadDesignSystem, falling back to the Designer's pinned @tailwindcss/node 4.3.5; shape-check the API; on failure report mode-off with a reason) + TailwindService: theme scales from the class list and theme namespaces, project breakpoints, variants, per-class CSS and declared properties, class parsing (variants, root, value), conflict detection by CSS properties (var(--tw-...) reads ignored), mobile-first resolution (inherited vs overridden), class-order sorting via getClassOrder only when the repo's prettier config uses prettier-plugin-tailwindcss else append.
2. HTTP API /api/tailwind/{info,analyze,apply-plan,palette,css}; edits go through the existing 56.4 setAttr class op (no new write path); dynamic class values stay read-only ('conditional: <name>').
3. Forced-state preview: CDP CSS.forcePseudoState in src/server/cdp.ts (nonce-found frame), and an injected temporary rule through the agent elsewhere.
4. Shell: new Tailwind tab (new files tailwind-state.ts, tailwind-panel.ts; one tab in shell.ts) with state toolbar, breakpoint/inherited display from FrameSet.selectedBreakpoint, style panels (spacing, color, type, radius, shadow, layout, size) using gable-ui components, searchable class palette with hover preview + autocomplete. Project breakpoints replace TAILWIND_BREAKPOINTS in devices.ts/frames.
5. Tests (vitest) on a fixture Tailwind project; driven runs on examples/ui-gallery in headless Edge over CDP; README + glossary notes; tsc and gable-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: src/server/tailwind/{design-system,model,controls,api,types}.ts. design-system.ts is the only file touching Tailwind (__unstable__loadDesignSystem from the project's @tailwindcss/node, then via @tailwindcss/vite, then the Designer's pinned 4.3.5 copy; shape-checked; any failure = mode off with a message, Edit tab unaffected). Conflicts: a class's claimed properties are its declared properties minus values that only read var(--tw-*), shorthand→longhand table, narrower-than-existing keeps both, only same-variant tokens compared. Order: Tailwind getClassOrder only when the project's prettier config lists prettier-plugin-tailwindcss, otherwise append (this repo has no class sorter). Writes go through the 56.4 setAttr class op (EditState.edit), no new write path. Shell: shell/src/app/tailwind-{state,panel}.ts, one Tailwind tab + one inject in shell.ts, FrameSet.breakpoints (frames.ts) replaces the v4 defaults with the project's. gable-ui added: command (UiCommand). Used: Tabs, ToggleGroup, Command, Tooltip, Badge, Button, Separator. Missing gable-ui, plain markup marked TODO(gable-ui): a text Input with clear button, a swatch/scale picker grid. Bugs found by the driven run and fixed: CSS.forcePseudoState release used node ids invalidated by DOM.getDocument (release first now); injected-rule rewrite stripped ':hover' inside the escaped class name for breakpoint+state tokens (xl:hover:...), now only real pseudo-classes. Evidence: vitest 69/69 in packages/designer (26 in tailwind.test.ts), tsc clean, gable-check 0 errors, e2e/tailwind-check.mjs on examples/ui-gallery in headless Edge over CDP: 39/39 with CDP, 38/38 without (injected rule path), and --off on examples/todomvc (3/3). Not verified: the Tauri/WebView2 window itself (same Chromium CDP path, not run); prettier-plugin ordering only by unit tests (no project here sorts classes); swatches for theme colors that are var(--x) have none (cannot be resolved in the shell).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T04:24:00Z

---

Spike finding: class tokens are static attributes, so they become mappable once attribute positions exist (see TASK-56.4 comment).

---

created: 2026-11-07T05:22:00Z

---

From TASK-56.3 (merged): the shell theme and Tailwind are a separate build from the previewed project, so they cannot collide.

---

created: 2026-11-07T05:53:00Z

---

From TASK-56.4 (merged): parseTemplateTree(rawTemplate) gives elements with start/nameEnd/openEnd/closeStart and attrInfo[] {name,nameEnd,valueStart,valueEnd,quote,start,end}; edit via {op:"setAttr",target,name:"class",value} / removeAttr, setBinding for [class.x]; result {ok,label,file,select} or {ok:false,code,error}. Dynamic class values ({{ }} or bindings) are read-only. From TASK-56.5 (merged): read FrameSet.selected, selectedWidth, selectedBreakpoint in packages/designer/shell/src/app/frames.ts; breakpoints are Tailwind v4 defaults in devices.ts (TAILWIND_BREAKPOINTS), replace with the project own. CDP can force pseudo-states on WebView2 (src/server/cdp.ts is the client).

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Designer Tailwind mode: loads the project's real Tailwind v4 design system (pinned 4.3.5 loader, documented fallback), style panels and option pickers fed from the project theme, static-class-only edits via the 56.4 setAttr op with property-based conflict replacement, frame-driven breakpoint prefixes with inherited/overridden display, state toolbar with forced-state preview (CDP or injected rule), searchable class palette with hover preview, formatter-order insertion when a sorter is configured (else append). Verified by 69 vitest tests, tsc, gable-check, and a driven e2e in headless Edge (CDP and non-CDP). Not run in the Tauri/WebView2 window; sorted-order path covered by unit tests only.
<!-- SECTION:FINAL_SUMMARY:END -->
