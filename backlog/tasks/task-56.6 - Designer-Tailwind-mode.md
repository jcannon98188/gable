---
id: TASK-56.6
title: 'Designer: Tailwind mode'
status: To Do
assignee: []
created_date: '2026-11-07T03:58:00Z'
updated_date: '2026-11-07T05:53:00Z'
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
- [ ] #1 Tailwind v4 design system is loaded from the project, with a documented fallback if the loader API changes
- [ ] #2 Style panels draw scales (spacing, color, type, radius, shadow) from the project theme
- [ ] #3 Edits change static class tokens only, replacing conflicting classes by comparing the CSS properties they set
- [ ] #4 The selected frame chooses the breakpoint prefix, and the panel shows inherited versus overridden values
- [ ] #5 A state toolbar edits hover, focus, disabled, group and dark variants, with forced-state preview (CDP on WebView2, injected rule elsewhere)
- [ ] #6 Searchable class palette with live hover preview and autocomplete for typed classes
- [ ] #7 Inserted class order matches the repo formatter or prettier plugin
<!-- AC:END -->

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
