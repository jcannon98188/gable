---
id: TASK-56.14
title: 'Designer: surface template compile errors; fix the read-only hatch check'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T17:01:00Z'
updated_date: '2026-11-07T17:24:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When an edited template fails to compile (e.g. interpolation in an attribute, which Gable rejects: packages/core/src/template.ts:471), the preview keeps running the last good template and the Designer silently shows it with every element hatched as stale. Surface the compile error (Problems tab and/or HMR timeline and a canvas banner naming file, line and message) and say the canvas is showing the last good version. Also fix e2e/polish-check.mjs, which wrote an invalid class='{{ }}' and so never tested the real dynamic-class hatch: use a supported form ([class]=expr or [class.x]=expr) and verify the read-only hatch for it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A template that fails to compile shows its error in the Designer (file, line, message) and a note that the canvas shows the last good version; clears when fixed
- [x] #2 polish-check uses valid Gable for the dynamic-class case and passes, confirming the read-only hatch (or the hatch/Tailwind read-only behaviour is fixed if it does not appear)
- [x] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Repro (todomvc, class="x {{ draft() }}" on the h1): Problems shows nothing (the change-triggered analysis was folded into the one already running, which read the old file), the HMR timeline has a bare rolled-back row without file/line, and the selected element is hatched read-only with 'template literal is not in the file any more'.
1. language-service: export checkTemplateSyntax(file, text): the template-syntax and expression-syntax errors of one file, no type-check (ms).
2. designer backend: CompileChecks (src/server/compile-check.ts) runs it on every changed .ts file (all pending files of a debounce burst) and once over the project; GET /api/compile and SSE 'compile'. MCP get_problems includes them. runAnalysis queues one more run when asked while running.
3. shell: DesignerState.compileErrors + rolledBack (latest HMR entry per module is rolled-back); canvas banner (file:line:col, message, 'canvas shows the last good version' when the hot update rolled back), Problems lists compile errors the analysis has not caught up with; the hatch says 'stale' for an element of a template that no longer matches the file. Clears when the file compiles / the next update applies.
4. polish-check: [class.x] binding for the dynamic-class hatch; add a compile-error banner check. Fix Tailwind read-only handling if [class.x] is not hatched.
5. Tests: LS checkTemplateSyntax, CompileChecks, shell banner state; tsc, typecheck:tests, designer build, vitest, polish-check on todomvc and ui-gallery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan step 4 changed: [class.x]="cond" only toggles one class next to the written list, so the list stays editable and is correctly not hatched. [class]="expr" is not valid Gable: it binds a DOM property named class, which does not exist, so the renderer throws in dev. The whole-list form is [attr.class] (or [className]). The Style panel treated [attr.class] as writable, because it only looked at the static class attribute, so the hatch never appeared. Fixed: classListWritable/conditionalClasses in tailwind-state.ts. The core and LS error hint for class="{{ }}" also suggested [class]; it now says [attr.class] or [class.name]. polish-check now covers [attr.class] (hatched 'dynamic') and [class.x] (no hatch). Ternaries are not allowed in Gable expressions, so the check adds a headingClass computed.

Verified headless (scratchpad harness: built Designer and headless Edge, its own processes killed by PID tree): polish-check on todomvc and on ui-gallery --tailwind both pass every check. That includes the new compile-error checks: the banner names src/components/todo-app.ts:14:22 and src/gallery.ts:33:22 with the message; it shows the 'last good version' note, the stale hatch and the Problems row; and all of it clears after the restore. The page's rollback can arrive before the backend's 250 ms debounce, so the banner briefly shows the HMR-only fallback first. The check waits for file:line:column.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A template that does not compile is now named in the Designer, not left silently stale.
- **Backend:** the language service's new checkTemplateSyntax (syntax only, no type-check) runs on every changed file (designer src/server/compile-check.ts). Results go out at once over GET /api/compile and the SSE 'compile' event, and MCP get_problems returns them as notCompiling.
- **Shell:** a banner over the canvas shows file:line:column and the message, plus 'The canvas shows the last good version until this is fixed.' once the page rolls the hot update back (shell/src/app/stale-canvas.ts). Problems lists the error until the full analysis catches up, the HMR timeline repeats it, and the selected element is hatched 'stale'. Everything clears on the next save that compiles.
- **Analysis queue:** fixed. A run requested while one was in flight used to be dropped, which is why Problems missed the error.
- **Read-only hatch:** [class]="expr" is not valid Gable, so polish-check now uses [attr.class]="headingClass()". The Style panel did not treat that as read-only and does now, labelled 'dynamic'. polish-check also confirms that [class.x] keeps the list editable (no hatch). The core/LS hint for class="{{ }}" now suggests [attr.class] or [class.name] instead of the broken [class].
- **Tests:** language-service template-syntax.test.ts; designer compile-errors.test.ts (CompileChecks, the stale-canvas logic, class-list writability); mcp.test.ts (notCompiling).
- **Verification:** designer tsc, typecheck:tests, designer build and full vitest (179 files, 1586 tests) pass. polish-check passes headless on todomvc and on ui-gallery --tailwind.
<!-- SECTION:FINAL_SUMMARY:END -->
