---
id: TASK-100.11
title: Keep the engine workspace Gable-agnostic
status: To Do
assignee: []
created_date: '2026-11-08T23:06:00Z'
updated_date: '2026-11-08T23:07:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.7
documentation:
  - docs/js-engine-spec.md
  - docs/adr/0015-intl-on-icu4x-behind-the-gable-js-intl-seam.md
  - docs/adr/0006-engine-interface-is-handle-based-and-host-driven.md
parent_task_id: TASK-100
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Gable JS engine (native/engine, TASK-100) is planned to become its own release outside Gable once M9 lands and a few optimization passes are done (see TASK-100.12). Extraction is only a mechanical repository split if nothing under the engine workspace depends on Gable code, vocabulary or build setup. M7 (TASK-100.8) is where the engine-interface adapter lands, so the boundary rule has to be in place before it, and applied as M7 to M9 land. The engine-api crate (gable-engine-api, ADR 0006) is the only surface shared with Gable; the host trait is how Gable reaches in. The Intl seam (ADR 0015) and the regex seam (ADR 0013) are the pattern to follow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No crate in native/engine depends on any Gable crate, template vocabulary or renderer type; Gable-specific adaptation lives on the Gable side of the host trait
- [ ] #2 A CI job builds and tests the engine workspace from a checkout containing only native/engine (for example a copy into a temporary directory), proving it builds standalone
- [ ] #3 Engine-crate names, docs and public identifiers do not assume Gable (Gable may appear in ADR context and history, not in APIs); a short note in docs/js-engine-spec.md records the boundary rule for M7 to M9
- [ ] #4 The rule is recorded as an ADR in docs/adr
<!-- AC:END -->
