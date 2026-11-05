---
id: TASK-1.3
title: Language-service plugins for template literals
status: Done
assignee: []
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:23'
labels:
  - 'wayfinder:research'
dependencies: []
parent_task_id: TASK-1
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How do ts-lit-plugin and the Angular language service type-check and complete templates? What can a TypeScript language-service plugin do for tagged-template-literal templates, and what are its limits (tsserver only, no tsc)?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:23
---
Findings: branch research/template-language-services @ e7f3d76, file research/template-language-services.md. A tsserver plugin can add completions, diagnostics and quick info in tagged templates but never affects tsc, so CI needs its own CLI. Suggested shape: a pure analyzer core reusing the runtime template parser and emitting a virtual type-check block per template, a thin tsserver plugin plus a gable-check CLI, with Volar and a patched tsc deferred. Some details unverified.
---
<!-- COMMENTS:END -->
