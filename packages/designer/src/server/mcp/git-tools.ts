// The MCP tools behind the Source control view (TASK-56.25): what changed in the project's working tree, one file's diff
// as hunks, committing a selection, reverting a file or a hunk and putting the revert back. They run git in the backend,
// exactly as the drawer's Changes tab does, and tell the Designer window to refresh. Nothing here needs a window.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GROUP_LABEL, GROUP_ORDER, type ChangedFile, type FileDiff, type GitError, type GitStatus } from "../../git.js";
import type { GitService } from "../git.js";

type Annotated = { title: string; description: string; annotations: Record<string, boolean> };

export interface GitToolKit {
  server: McpServer;
  git(): GitService;
  /** Tells the Designer window the changes changed. */
  changed(): void;
  guard<A>(body: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult>;
  fail(message: string): never;
  read(name: string, description: string): Annotated;
  write(name: string, description: string, idempotent?: boolean): Annotated;
}

const file = (f: ChangedFile) => ({
  path: f.path,
  ...(f.from ? { from: f.from } : {}),
  status: f.status,
  staged: f.staged,
  unstaged: f.unstaged,
  ...(f.binary ? { binary: true } : f.added === null ? {} : { added: f.added, removed: f.removed }),
});

/** The changes as an agent reads them: grouped as the Changes tab groups them. */
export function changesView(s: GitStatus) {
  return {
    branch: s.branch ?? "(detached HEAD)",
    head: s.head ?? "(no commits yet)",
    changed: s.files.length,
    groups: GROUP_ORDER.map((g) => ({ group: g, label: GROUP_LABEL[g], files: s.files.filter((f) => f.group === g).map(file) })).filter((g) => g.files.length),
    ...(s.undo.length ? { undoableReverts: s.undo } : {}),
  };
}

export function registerGitTools(kit: GitToolKit): void {
  const { server, guard, read, write, fail } = kit;
  const unwrap = <T extends { ok: true }>(r: T | GitError): T => (r.ok ? r : fail(`${r.code}: ${r.error}`));
  const status = async () => {
    const s = await kit.git().status();
    return s.ok ? s : fail(s.error);
  };

  server.registerTool(
    "get_changes",
    {
      ...read("Get changes", "The files that differ from the last commit in the project folder (what the Designer's Changes tab lists), grouped as components and templates, scenarios, styles, pages, project config and other, each with its status (modified, added, deleted, renamed, untracked, conflicted), whether it is staged, and lines added and removed. Also the branch and the reverts that undo_revert can put back. Read-only."),
      inputSchema: {},
    },
    guard(async () => changesView(await status())),
  );

  server.registerTool(
    "get_file_diff",
    {
      ...read("Get file diff", "One changed file's unified diff against the last commit, split into hunks (`index`, `header`, `added`, `removed`, `text`) that revert_changes can take back one at a time. A diff over 400 KB is cut (`truncated`); a binary file has no hunks."),
      inputSchema: { path: z.string().describe("Project-relative path of a changed file, from get_changes.") },
    },
    guard(async ({ path }) => {
      const d: FileDiff = unwrap(await kit.git().diff(path));
      return { path: d.path, binary: d.binary, truncated: d.truncated, hunkRevert: d.hunkRevert, hunks: d.hunks, diff: d.text };
    }),
  );

  server.registerTool(
    "commit_changes",
    {
      ...write("Commit changes", "Commits exactly the listed changed files (new and deleted ones included) with the message; other changes stay out of the commit and stay as they are. Uses the repository's git identity and hooks; a failing hook or a missing identity is returned as the error and leaves the files uncommitted. A file with a merge conflict is refused. Commits are not pushed."),
      inputSchema: {
        paths: z.array(z.string()).min(1).max(500).describe("Project-relative paths from get_changes."),
        message: z.string().min(1).describe("The commit message (subject, blank line, body)."),
      },
    },
    guard(async ({ paths, message }) => {
      const r = unwrap(await kit.git().commit(paths, message));
      kit.changed();
      return r;
    }),
  );

  server.registerTool(
    "revert_changes",
    {
      ...write("Revert changes", "Takes a changed file back to its last committed state (a new file is deleted), or with `hunk` only that hunk of a modified file (the index from get_file_diff). The working tree changes at once and the dev server hot-updates the canvas. The reverted change is kept in memory so undo_revert can put it back until the Designer closes; commit first if it matters beyond that.", true),
      inputSchema: {
        path: z.string().describe("Project-relative path of a changed file."),
        hunk: z.number().int().min(0).optional().describe("Hunk index from get_file_diff; omit to revert the whole file."),
        header: z.string().optional().describe("The hunk's `@@` line from get_file_diff, to refuse a stale index; read from the current diff when omitted."),
      },
    },
    guard(async ({ path, hunk, header }) => {
      const git = kit.git();
      let r;
      if (hunk === undefined) r = unwrap(await git.revertFile(path));
      else {
        const h = header ?? unwrap(await git.diff(path)).hunks[hunk]?.header;
        if (h === undefined) fail(`${path} has no hunk ${hunk}.`);
        r = unwrap(await git.revertHunk(path, hunk, h));
      }
      kit.changed();
      return r;
    }),
  );

  server.registerTool(
    "undo_revert",
    { ...write("Undo revert", "Puts back the newest revert made through the Designer (revert_changes or the Changes tab), if the file still allows it. It is only kept in memory while the Designer runs."), inputSchema: {} },
    guard(async () => {
      const r = unwrap(await kit.git().undoRevert());
      kit.changed();
      return r;
    }),
  );
}
