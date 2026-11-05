---
id: TASK-1.11
title: Template language service v0 design
status: To Do
assignee: []
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:53'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.3
  - TASK-1.4
parent_task_id: TASK-1
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the v0 design of the TS language-service plugin: type-checking template expressions against the component class, completions, and diagnostics for unknown inputs/outputs/selectors and signal/observable misuse?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:46
---
From Template syntax: the language service reuses gable's expression parser. Expression language is minimal (reads, calls, literals, !, ??, pipes); no globals. Needs diagnostics for lazy() imports used outside @defer, and typing for the built-in async pipe.
---

created: 2026-11-05 04:53
---
Amendment from Template syntax (user): value expressions allow only property reads, zero-arg signal reads, literals, !, ??, pipes; no method calls. The language service must diagnose violations and provide quick-fix refactors that extract a computed signal (an enhanced view model) onto the component and rewrite the template to read it. Event-binding handler calls remain allowed.
---
<!-- COMMENTS:END -->
