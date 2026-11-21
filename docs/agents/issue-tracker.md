# Issue tracker: tasklog

Issues and PRDs for this repo are tasklog tickets in `.tasklog/`. Use the tasklog MCP tools (the `tasklog` CLI starts the daemon, `tasklog doctor` checks the install); do not edit ticket files by hand.

A ticket's id is `<effort>/<NN>`, for example `canvas/141`. An effort is a body of work in its own directory: `.tasklog/<effort>/map.md` and `spec.md` when it has them, and `tickets/NN-slug.md`. Current efforts:

| Effort | Holds |
| --- | --- |
| `gable-v0` | The v0 design map and framework spec, and their children |
| `core` | Core framework, store, router, i18n, testing and tooling tasks |
| `ui` | gable-ui and ui-primitives components and the ui-gallery |
| `designer` | The visual editor |
| `editor` | The collaborative rich text editor |
| `native` | The Gable Native design map |
| `canvas` | The canvas design map and the `@gablejs/renderer-pixi` build |
| `service-worker` | `@gablejs/service-worker` and its follow-ups |
| `site` | The marketing site and docs |

The tickets were imported from Backlog.md. Each keeps its old path in `imported_from`, and its old `TASK-n` id appears in older commit messages and in `imported_from`. Tickets that were Backlog.md epics (for example the former TASK-105) are ordinary tickets in their effort; their children carry a `parent-<n>` tag. Imported tickets keep their old labels as tags.

## Conventions

- **Create an issue**: `create_item` with `effort`, `title` and `question`; `add_ac` for each acceptance criterion; `triage` with state `needs-triage`. Start a new body of work with `create_effort`.
- **Read an issue**: `get_item` (`sections` for part of it, `meta_only` for the hash and frontmatter).
- **List / search**: `list_items` (filters `effort`, `status`, `tags_all`, `text`) and `frontier` for what is ready.
- **Comment**: `append_to_section` with heading `Comments`.
- **Apply / remove labels**: tags, through `triage` for the triage vocabulary and `set_fields` (`tags` replaces the list) for the rest.
- **Close**: `resolve` writes the answer (the former final summary) and, given a `gist`, adds the line to the map's Decisions so far. `close` rules a ticket out; `triage` with `wontfix` closes it with the reason.
- **Blockers**: `blocked_by` on `create_item` or `set_fields` (`effort/NN` across efforts).

Statuses are `open`, `claimed`, `resolved` and `closed`. Triage state lives in tags, not statuses.

## When a skill says "publish to the issue tracker"

Create a tasklog ticket.

## When a skill says "fetch the relevant ticket"

Call `get_item` with its id.

## Wayfinding operations

- **Map**: the effort's `map.md` (id `<effort>/map`). Its Destination, Notes, Decisions so far, Not yet specified and Out of scope sections are the map body. The v0, native and canvas maps were imported as ordinary tickets (`gable-v0/01`, `native/99`, `canvas/104`) and have no `map.md` yet.
- **Tickets**: tickets of the effort, with `type` `research`, `prototype`, `grilling` or `task`.
- **Blocking**: `blocked_by`, set at creation or with `set_fields` (replaces the list).
- **Frontier**: `frontier` for the effort lists open tickets whose blockers are resolved, plus claimed and blocked ones.
- **Claim**: `claim` first, before any work.
- **Resolve**: `resolve` with the answer and a `gist`, which appends the one-line entry and link to the map's Decisions so far.
