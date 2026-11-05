# Issue tracker: Backlog.md

Issues and PRDs for this repo are Backlog.md tasks in `backlog/`. Use the `backlog` CLI, never edit task files directly. Run `backlog instructions task-creation` before creating tasks and `backlog <command> --help` for unfamiliar flags.

## Conventions

- **Create an issue**: `backlog task create "Title" -d "body" --ac "criterion" -l needs-triage`
- **Read an issue**: `backlog task view TASK-123 --plain`
- **List / search**: `backlog task list --labels <label> --plain`, `backlog search "query" --plain`
- **Comment**: `backlog task edit TASK-123 --comment "text"`
- **Apply / remove labels**: `backlog task edit TASK-123 --add-label <label>` / `--remove-label <label>`
- **Close**: `backlog task edit TASK-123 -s Done` (add `--final-summary` for the outcome). For `wontfix`, apply the label and comment with the reason before closing.
- **Sub-issues / blockers**: `--parent TASK-1`, `--depends-on TASK-2`

Statuses are `To Do`, `In Progress`, `Done`. Triage state lives in labels, not statuses.

## When a skill says "publish to the issue tracker"

Create a Backlog.md task.

## When a skill says "fetch the relevant ticket"

Run `backlog task view <id> --plain`.

## Wayfinding operations

- **Map**: one task labelled `wayfinder:map` (currently `TASK-1`). Its description is the map body.
- **Tickets**: child tasks of the map (`-p TASK-1`, ids like `TASK-1.4`), each labelled `wayfinder:<research|prototype|grilling|task>`. No other labels.
- **Blocking**: `--dep TASK-1.x,...` (native Backlog.md dependencies). Set at creation; change with `backlog task edit <id> --dep ...` (replaces the list).
- **Frontier**: open children whose dependencies are all `Done` and that are unassigned. List with `backlog task list --parent TASK-1 --plain` and inspect with `backlog task view <id> --plain`.
- **Claim**: assign first, before any work: `backlog task edit <id> -a @<dev>`.
- **Resolve**: post the answer with `backlog task edit <id> --comment "..."`, then `-s Done`; append a one-line gist plus the ticket link to the map's "Decisions so far" via `backlog task edit TASK-1 -d "<full replacement body>"`.
