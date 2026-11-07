// The Source control view's shared types and pure helpers (TASK-56.25). Git runs in the backend (src/server/git.ts); the
// shell, the HTTP API and the MCP tools all speak these shapes. Nothing here keeps a model of the design: the working tree
// is the truth (ADR 0001), and this is only a view of what changed in it.

/** What a changed file is, in words (git's two status letters, folded). */
export type ChangeStatus = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted" | "typechange";

/** The groups the changed-files list is sectioned by (what the file is to a Gable project). */
export type ChangeGroup = "components" | "scenes" | "styles" | "pages" | "config" | "other";

export const GROUP_ORDER: ChangeGroup[] = ["components", "scenes", "styles", "pages", "config", "other"];
export const GROUP_LABEL: Record<ChangeGroup, string> = {
  components: "Components and templates",
  scenes: "Scenarios",
  styles: "Styles",
  pages: "Pages",
  config: "Project config",
  other: "Other files",
};

/** The group a project-relative path belongs to. */
export function groupOf(path: string): ChangeGroup {
  const name = path.split("/").pop() ?? path;
  if (/\.scenes\.tsx?$/.test(name)) return "scenes";
  if (/\.(css|scss|sass|less)$/.test(name)) return "styles";
  if (/\.html?$/.test(name)) return "pages";
  if (/^(package(-lock)?\.json|tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|gable-ui\.json|\.prettierrc[^/]*|\.gitignore)$/.test(name)) return "config";
  if (/\.(tsx?|mts|cts)$/.test(name)) return "components";
  return "other";
}

export interface ChangedFile {
  /** Project-relative, forward slashes. */
  path: string;
  /** The old path of a rename. */
  from?: string;
  status: ChangeStatus;
  /** Part of the change is in the index. */
  staged: boolean;
  /** Part of the change is only in the working tree (an untracked file counts). */
  unstaged: boolean;
  group: ChangeGroup;
  /** Lines added and removed against HEAD; null for a binary file or one too large to count. */
  added: number | null;
  removed: number | null;
  binary: boolean;
}

export type GitUnavailable = "no-git" | "not-a-repo";

export interface GitStatus {
  ok: true;
  /** The branch name; null when HEAD is detached. */
  branch: string | null;
  /** The short id of HEAD; null in a repository with no commits yet. */
  head: string | null;
  /** The project folder is inside a larger repository (the files listed are the project's own). */
  prefix: string;
  files: ChangedFile[];
  /** Changes that can be taken back with undo_revert (the newest first). */
  undo: string[];
}
export type GitStatusResult = GitStatus | { ok: false; reason: GitUnavailable; error: string };

export interface Hunk {
  index: number;
  /** The `@@ … @@` line. */
  header: string;
  /** The hunk as unified diff text: the header and its lines, each ending in a newline. */
  text: string;
  added: number;
  removed: number;
}

export interface FileDiff {
  ok: true;
  path: string;
  /** The diff's file header lines (`diff --git`, `index`, `---`, `+++`). */
  header: string[];
  hunks: Hunk[];
  binary: boolean;
  /** The diff was longer than the backend sends (`MAX_DIFF_BYTES`). */
  truncated: boolean;
  /** Hunks can be reverted one at a time (not for a conflict, a new, deleted, binary or truncated file). */
  hunkRevert: boolean;
  /** The whole diff as unified text. */
  text: string;
}

export type GitError = { ok: false; code: "invalid" | "missing" | "conflict" | "git" | "nothing"; error: string };

export interface CommitResult {
  ok: true;
  sha: string;
  subject: string;
  files: string[];
}

export interface RevertResult {
  ok: true;
  /** What was reverted, as the undo list names it. */
  label: string;
  files: string[];
}

export const MAX_DIFF_BYTES = 400_000;
export const MAX_MESSAGE_CHARS = 20_000;

/** Splits unified diff text into its file header and hunks (a `@@` line starts a hunk). */
export function parseFileDiff(text: string): { header: string[]; hunks: Hunk[]; binary: boolean } {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const header: string[] = [];
  const hunks: Hunk[] = [];
  let cur: { header: string; lines: string[]; added: number; removed: number } | null = null;
  const close = () => {
    if (cur) hunks.push({ index: hunks.length, header: cur.header, text: cur.lines.join("\n") + "\n", added: cur.added, removed: cur.removed });
    cur = null;
  };
  for (const line of lines) {
    if (line.startsWith("@@")) {
      close();
      cur = { header: line, lines: [line], added: 0, removed: 0 };
    } else if (cur) {
      cur.lines.push(line);
      if (line.startsWith("+")) cur.added++;
      else if (line.startsWith("-")) cur.removed++;
    } else header.push(line);
  }
  close();
  const binary = hunks.length === 0 && header.some((l) => /^(Binary files .* differ|GIT binary patch)$/.test(l));
  return { header, hunks, binary };
}

/** A one-line subject for a commit message box, from the files chosen (a suggestion; the person edits it). */
export function suggestMessage(files: Array<Pick<ChangedFile, "path" | "status">>): string {
  if (files.length === 0) return "";
  const name = (p: string) => p.split("/").pop() ?? p;
  if (files.length === 1) {
    const f = files[0]!;
    const verb = f.status === "added" || f.status === "untracked" ? "Add" : f.status === "deleted" ? "Remove" : f.status === "renamed" ? "Rename" : "Update";
    return `${verb} ${name(f.path)}`;
  }
  return `Update ${files.length} files`;
}
