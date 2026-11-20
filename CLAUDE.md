
## Tasklog workflow

This project tracks tasks and design maps with tasklog (`.tasklog/`, one directory per effort). Ticket ids look like `canvas/141`; `docs/agents/issue-tracker.md` lists the efforts and the tool for each operation.

At the beginning of each conversation, call the tasklog `overview` tool (no effort: one line per effort) before searching, reading, creating or updating tickets. Claim a ticket with `claim` before working on it, and close it with `resolve` (answer plus a map gist) or `close`.

Use the tasklog MCP tools, not hand edits, for ticket files, so hashes, blockers and the maps' Decisions-so-far stay consistent. Older commit messages, ADRs and the `imported_from` field refer to the former Backlog.md ids (`TASK-n`); the references in the repo were rewritten to the tasklog ids.

## The JavaScript engine lives elsewhere

The JavaScript engine (AgniJS, formerly the Gable engine) lives in the agnijs repository, https://github.com/agnijs-rs/agnijs: engine code, engine tickets (TASK-100.x to TASK-103.x), the spec and the engine ADRs are there, not here. Gable depends on it by pinned git revision (ADR 0018) and keeps only `native/engine-harness` and the switch-over report.

## Agent skills

### Issue tracker

Issues are tasklog tickets, managed with the tasklog MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary, applied as tasklog ticket tags (the `triage` tool). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
