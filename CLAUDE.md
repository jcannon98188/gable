
<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.53.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

## The JavaScript engine lives elsewhere

The JavaScript engine (AgniJS, formerly the Gable engine) lives in the agnijs repository, https://github.com/agnijs-rs/agnijs: engine code, engine tickets (TASK-100.x to TASK-103.x), the spec and the engine ADRs are there, not here. Gable depends on it by pinned git revision (ADR 0018) and keeps only `native/engine-harness` and the switch-over report.

## Agent skills

### Issue tracker

Issues are Backlog.md tasks, managed with the `backlog` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary, applied as Backlog.md task labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
