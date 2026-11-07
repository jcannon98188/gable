---
id: TASK-56.4
title: 'Designer: source write-back, undo and structural edits'
status: To Do
assignee: []
created_date: '2026-11-07T03:57:00Z'
updated_date: '2026-11-07T04:24:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.3
parent_task_id: TASK-56
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Visual edits must land as small reviewable text patches so code and designer stay interchangeable, which is the core of the source-of-truth decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A dev-server endpoint applies minimal patches to template text, static meta and CSS, and HMR updates the canvas
- [ ] #2 Text, attribute and binding edits work, with a binding picker listing existing typed signals
- [ ] #3 Insert from a palette of gable-ui and project components, move, delete, and wrap in @if/@for
- [ ] #4 Undo and redo apply reverse patches, including after external edits to the file are detected
- [ ] #5 Edits keep the repo formatter output so diffs stay clean
- [ ] #6 Dynamic expressions and bindings the designer cannot edit safely are displayed read-only and are never rewritten
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T04:24:00Z

---

Spike finding: the runtime parser only has element positions. Make @gable/template-format lossless parser the position authority (text, attributes, expressions), with the runtime pos as a handle (ordinal in that tree) so two parsers cannot drift. The runtime parser reads cooked strings[0], so backslash escapes shift offsets; CRLF files differ too. Parse the raw string.

---
<!-- COMMENTS:END -->
