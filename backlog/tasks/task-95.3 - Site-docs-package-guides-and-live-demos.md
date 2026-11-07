---
id: TASK-95.3
title: 'Site docs: package guides and live demos'
status: To Do
assignee: []
created_date: '2026-11-07T20:22:00Z'
labels: []
dependencies: []
parent_task_id: TASK-95
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every library needs a how-to-use guide and runnable demos. Demos are real Gable components mounted in the page with their source shown beside them (ui-code-block), written so a later playground can open them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Guide page for each package (core, renderer-dom, template-format, language-service, prettier-plugin, vite, testing, ui-primitives, ui, gable-ui, designer, store, editor, devtools-extension, vscode, create-gable), reusing docs/*.md where they exist
- [ ] #2 At least one live demo with source for each runtime library; tooling packages show commands and config instead
- [ ] #3 Demos are isolated from the site's own styles and state, and a failing demo does not break the page
<!-- AC:END -->
