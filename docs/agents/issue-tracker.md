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
