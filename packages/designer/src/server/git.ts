// Source control through the git CLI (TASK-56.25). The backend runs git in the project folder (which may sit inside a larger
// repository: only the project's files are listed). The Designer keeps no model of the design (ADR 0001): the changes are
// whatever git says differs from HEAD, and committing or reverting is git doing it.
//
// Safety: every path a caller names must be a file that is changed right now (so nothing else can be committed, restored or
// deleted through this), commands take paths as literals (`--literal-pathspecs`), and a revert saves what it removes so
// `undoRevert` can put it back (in memory; it is gone when the Designer closes).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  MAX_DIFF_BYTES,
  MAX_MESSAGE_CHARS,
  groupOf,
  parseFileDiff,
  type ChangeStatus,
  type ChangedFile,
  type CommitResult,
  type FileDiff,
  type GitError,
  type GitStatusResult,
  type RevertResult,
} from "../git.js";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const COUNT_LIMIT = 1_000_000;
const MAX_UNDO = 20;
const MAX_UNDO_FILE = 5_000_000;

interface Run {
  code: number;
  stdout: Buffer;
  stderr: string;
}

type UndoEntry =
  | { label: string; kind: "patch"; patch: Buffer; index: boolean; files: string[] }
  | { label: string; kind: "files"; files: Array<{ path: string; content: Buffer }> };

const err = (code: GitError["code"], error: string): GitError => ({ ok: false, code, error });

/** git status's two letters, as one status (and what the index and the working tree each hold). */
function statusOf(x: string, y: string): { status: ChangeStatus; staged: boolean; unstaged: boolean } {
  if (x === "?" && y === "?") return { status: "untracked", staged: false, unstaged: true };
  const conflicted = x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D");
  const staged = x !== " " && x !== "?";
  const unstaged = y !== " ";
  const letter = conflicted ? "U" : x !== " " ? x : y;
  const status: ChangeStatus = letter === "U" ? "conflicted" : letter === "A" ? "added" : letter === "D" ? "deleted" : letter === "R" || letter === "C" ? "renamed" : letter === "T" ? "typechange" : "modified";
  return { status, staged, unstaged };
}

export class GitService {
  #undo: UndoEntry[] = [];
  #prefix: string | null = null;

  constructor(readonly root: string) {}

  /** Runs git in the project folder. Never throws for a non-zero exit; a missing git is code -1. */
  #git(args: string[], opts: { input?: Buffer | string; cwd?: string } = {}): Promise<Run> {
    return new Promise((ok) => {
      const child = execFile(
        "git",
        ["--no-pager", "--literal-pathspecs", "-c", "core.quotepath=off", "-c", "color.ui=never", ...args],
        { cwd: opts.cwd ?? this.root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: 60_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" } },
        (e, stdout, stderr) => {
          const code = e ? (typeof (e as { code?: unknown }).code === "number" ? ((e as { code: number }).code) : -1) : 0;
          ok({ code, stdout: stdout as Buffer, stderr: (stderr as Buffer).toString("utf8").trim() || (code === -1 && e ? e.message : "") });
        },
      );
      if (opts.input !== undefined) child.stdin?.end(opts.input);
      else child.stdin?.end();
    });
  }

  async #text(args: string[]): Promise<string | null> {
    const r = await this.#git(args);
    return r.code === 0 ? r.stdout.toString("utf8").trim() : null;
  }

  /** The folder's path inside the repository (`examples/todomvc/`; empty at the top), or null outside a repository. */
  async #repoPrefix(): Promise<string | null> {
    if (this.#prefix !== null) return this.#prefix;
    const p = await this.#text(["rev-parse", "--show-prefix"]);
    if (p === null) return null;
    return (this.#prefix = p);
  }

  async #headRef(): Promise<string> {
    return (await this.#text(["rev-parse", "--verify", "-q", "HEAD"])) ? "HEAD" : EMPTY_TREE;
  }

  /** The changed files of the project folder, grouped and counted. */
  async status(): Promise<GitStatusResult> {
    const probe = await this.#git(["--version"]);
    if (probe.code !== 0) return { ok: false, reason: "no-git", error: "git is not installed or not on the PATH." };
    const prefix = await this.#repoPrefix();
    if (prefix === null) return { ok: false, reason: "not-a-repo", error: "This project folder is not in a git repository." };
    const st = await this.#git(["status", "--porcelain=v1", "-z", "-uall", "--ignore-submodules", "--", "."]);
    if (st.code !== 0) return { ok: false, reason: "not-a-repo", error: st.stderr || "git status failed." };
    const files: ChangedFile[] = [];
    const entries = st.stdout.toString("utf8").split("\0");
    const rel = (p: string) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      if (e.length < 4) continue;
      const x = e[0]!;
      const y = e[1]!;
      const path = e.slice(3);
      const { status, staged, unstaged } = statusOf(x, y);
      let from: string | undefined;
      if (x === "R" || x === "C" || y === "R" || y === "C") from = rel(entries[++i] ?? "");
      files.push({ path: rel(path), ...(from ? { from } : {}), status, staged, unstaged, group: groupOf(rel(path)), added: null, removed: null, binary: false });
    }
    const head = await this.#headRef();
    const num = await this.#git(["diff", head, "--numstat", "-z", "--no-renames", "--relative", "--", "."]);
    const counts = new Map<string, { added: number | null; removed: number | null; binary: boolean }>();
    if (num.code === 0) {
      for (const row of num.stdout.toString("utf8").split("\0")) {
        const m = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(row);
        if (m) counts.set(m[3]!, m[1] === "-" ? { added: null, removed: null, binary: true } : { added: Number(m[1]), removed: Number(m[2]), binary: false });
      }
    }
    for (const f of files) {
      if (f.status === "untracked") {
        const c = this.#countUntracked(f.path);
        Object.assign(f, c);
      } else Object.assign(f, counts.get(f.path) ?? {});
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const branch = await this.#text(["symbolic-ref", "--short", "-q", "HEAD"]);
    const sha = head === "HEAD" ? await this.#text(["rev-parse", "--short", "HEAD"]) : null;
    return { ok: true, branch, head: sha, prefix, files, undo: this.#undo.map((u) => u.label).reverse() };
  }

  /** Lines of an untracked text file (what a diff against nothing adds); a binary or huge file is not counted. */
  #countUntracked(path: string): { added: number | null; removed: number | null; binary: boolean } {
    try {
      const abs = join(this.root, path);
      if (statSync(abs).size > COUNT_LIMIT) return { added: null, removed: null, binary: false };
      const buf = readFileSync(abs);
      if (buf.includes(0)) return { added: null, removed: null, binary: true };
      const text = buf.toString("utf8");
      return { added: text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0), removed: 0, binary: false };
    } catch {
      return { added: null, removed: null, binary: false };
    }
  }

  async #changed(paths: string[]): Promise<{ files: ChangedFile[] } | GitError> {
    if (paths.length === 0) return err("nothing", "Choose at least one file.");
    const s = await this.status();
    if (!s.ok) return err("git", s.error);
    const out: ChangedFile[] = [];
    for (const raw of paths) {
      const p = String(raw).replaceAll("\\", "/").replace(/^\.\//, "");
      const f = s.files.find((x) => x.path === p);
      if (!f) return err("missing", `${p} is not a changed file (it may have been committed or reverted already; refresh the changes).`);
      if (!out.includes(f)) out.push(f);
    }
    return { files: out };
  }

  /** The unified diff of one changed file against HEAD, as the hunks the view shows. */
  async diff(path: string): Promise<FileDiff | GitError> {
    const c = await this.#changed([path]);
    if ("ok" in c) return c;
    const f = c.files[0]!;
    const raw = await this.#rawDiff(f, true);
    if ("ok" in raw) return raw;
    const truncated = raw.length > MAX_DIFF_BYTES;
    const text = (truncated ? raw.subarray(0, MAX_DIFF_BYTES) : raw).toString("utf8");
    const parsed = parseFileDiff(text);
    const hunks = truncated ? parsed.hunks.slice(0, -1) : parsed.hunks;
    return {
      ok: true,
      path: f.path,
      header: parsed.header,
      hunks,
      binary: parsed.binary,
      truncated,
      hunkRevert: !truncated && !parsed.binary && f.status === "modified" && hunks.length > 0,
      text: truncated ? hunks.length ? parsed.header.concat(hunks.map((h) => h.text.replace(/\n$/, ""))).join("\n") + "\n" : text : text,
    };
  }

  /** `git diff` of the file against HEAD; `relative` shows project-relative names (the patch to apply keeps the repository's). */
  async #rawDiff(f: ChangedFile, relative: boolean): Promise<Buffer | GitError> {
    const flags = ["--no-color", "--no-ext-diff", "-U3", "--binary", ...(relative ? ["--relative"] : [])];
    if (f.status === "untracked") {
      const r = await this.#git(["diff", "--no-index", ...flags, "--", "/dev/null", f.path]);
      // --no-index exits 1 when the files differ.
      return r.code === 0 || r.code === 1 ? r.stdout : err("git", r.stderr || "git diff failed.");
    }
    const head = await this.#headRef();
    const r = await this.#git(["diff", head, ...flags, "-M", "--", ...(f.from ? [f.from] : []), f.path]);
    return r.code === 0 ? r.stdout : err("git", r.stderr || "git diff failed.");
  }

  /** Commits exactly the chosen files (anything else staged stays staged and out of the commit). */
  async commit(paths: string[], message: string): Promise<CommitResult | GitError> {
    const msg = String(message ?? "").trim();
    if (!msg) return err("invalid", "A commit needs a message.");
    if (msg.length > MAX_MESSAGE_CHARS) return err("invalid", "The commit message is too long.");
    const c = await this.#changed(paths);
    if ("ok" in c) return c;
    const conflicted = c.files.filter((f) => f.status === "conflicted");
    if (conflicted.length) return err("conflict", `Resolve the conflict in ${conflicted.map((f) => f.path).join(", ")} before committing it.`);
    const targets = c.files.flatMap((f) => (f.from ? [f.from, f.path] : [f.path]));
    // A rename's old path is already gone from the index (only a staged rename is reported as one), so only the new path is added.
    const add = await this.#git(["add", "-A", "--", ...c.files.map((f) => f.path)]);
    if (add.code !== 0) return err("git", add.stderr || "git add failed.");
    const commit = await this.#git(["commit", "-m", msg, "--only", "--", ...targets]);
    if (commit.code !== 0) {
      // Put the index back as it was for these files, so a failed commit (a hook, no identity) leaves nothing half done.
      await this.#git(["reset", "-q", "--", ...targets]);
      return err("git", commit.stderr || commit.stdout.toString("utf8").trim() || "git commit failed.");
    }
    const sha = (await this.#text(["rev-parse", "--short", "HEAD"])) ?? "";
    return { ok: true, sha, subject: msg.split("\n")[0]!, files: c.files.map((f) => f.path) };
  }

  /** Takes a whole file's changes back to HEAD (a new file is deleted). Undoable with `undoRevert`. */
  async revertFile(path: string): Promise<RevertResult | GitError> {
    const c = await this.#changed([path]);
    if ("ok" in c) return c;
    const f = c.files[0]!;
    if (f.status === "conflicted") return err("conflict", `${f.path} has a merge conflict; resolve it in git.`);
    const label = `Revert ${f.path}`;
    if (f.status === "untracked") {
      const abs = join(this.root, f.path);
      let content: Buffer;
      try {
        if (statSync(abs).size > MAX_UNDO_FILE) return err("invalid", `${f.path} is too large to revert safely (it could not be restored by Undo).`);
        content = readFileSync(abs);
      } catch (e) {
        return err("missing", `${f.path} cannot be read: ${e instanceof Error ? e.message : String(e)}`);
      }
      unlinkSync(abs);
      this.#push({ label, kind: "files", files: [{ path: f.path, content }] });
      return { ok: true, label, files: [f.path] };
    }
    const patch = await this.#rawDiff(f, false);
    if ("ok" in patch) return patch;
    if (patch.length > MAX_UNDO_FILE) return err("invalid", `${f.path} has too large a change to revert safely (it could not be restored by Undo).`);
    const newInIndex = f.status === "added" || f.status === "renamed";
    const targets = f.from ? [f.from, f.path] : [f.path];
    let r: Run;
    if (newInIndex) {
      r = await this.#git(["rm", "-f", "-q", "--", f.path]);
      if (r.code === 0 && f.from) r = await this.#git(["restore", "--source=HEAD", "--staged", "--worktree", "--", f.from]);
    } else r = await this.#git(["restore", "--source=HEAD", "--staged", "--worktree", "--", ...targets]);
    if (r.code !== 0) return err("git", r.stderr || "git restore failed.");
    this.#push({ label, kind: "patch", patch, index: newInIndex || (f.staged && !f.unstaged), files: targets });
    return { ok: true, label, files: [f.path] };
  }

  /** Takes one hunk of a modified file back. `header` must be the hunk's `@@` line as the diff showed it (a stale view is refused). */
  async revertHunk(path: string, index: number, header: string): Promise<RevertResult | GitError> {
    const c = await this.#changed([path]);
    if ("ok" in c) return c;
    const f = c.files[0]!;
    if (f.status !== "modified") return err("invalid", "Hunks can be reverted in a modified file; revert the whole file instead.");
    const raw = await this.#rawDiff(f, false);
    if ("ok" in raw) return raw;
    if (raw.length > MAX_DIFF_BYTES) return err("invalid", "The diff is too large to revert by hunk; revert the whole file.");
    const parsed = parseFileDiff(raw.toString("utf8"));
    const hunk = parsed.hunks[index];
    if (parsed.binary || !hunk || hunk.header !== header) return err("conflict", "The file changed since the diff was shown; refresh the changes.");
    const patch = Buffer.from(parsed.header.join("\n") + "\n" + hunk.text, "utf8");
    // Staged and working-tree copies that agree are reverted in both; otherwise only the working tree (which the diff is of).
    let index_ = f.staged;
    let check = await this.#git(["apply", "-R", "--check", ...(index_ ? ["--index"] : [])], { input: patch });
    if (check.code !== 0 && index_) {
      index_ = false;
      check = await this.#git(["apply", "-R", "--check"], { input: patch });
    }
    if (check.code !== 0) return err("conflict", `The hunk no longer applies: ${check.stderr}`);
    const r = await this.#git(["apply", "-R", ...(index_ ? ["--index"] : [])], { input: patch });
    if (r.code !== 0) return err("git", r.stderr || "git apply failed.");
    const label = `Revert a change in ${f.path}`;
    this.#push({ label, kind: "patch", patch, index: index_, files: [f.path] });
    return { ok: true, label, files: [f.path] };
  }

  #push(e: UndoEntry): void {
    this.#undo.push(e);
    if (this.#undo.length > MAX_UNDO) this.#undo.shift();
  }

  /** Puts the newest revert back. */
  async undoRevert(): Promise<RevertResult | GitError> {
    const e = this.#undo.at(-1);
    if (!e) return err("nothing", "There is no revert to undo.");
    if (e.kind === "files") {
      for (const f of e.files) {
        const abs = resolve(this.root, f.path);
        if (existsSync(abs)) return err("conflict", `${f.path} exists again; it was left as it is.`);
      }
      for (const f of e.files) {
        const abs = resolve(this.root, f.path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, f.content);
      }
    } else {
      // A hunk was applied in reverse and a file was restored to HEAD, so the saved patch (HEAD → the old state) goes back forward.
      const r = await this.#git(["apply", "--binary", ...(e.index ? ["--index"] : [])], { input: e.patch });
      if (r.code !== 0) return err("conflict", `The change could not be put back: ${r.stderr}`);
    }
    this.#undo.pop();
    return { ok: true, label: e.label.replace(/^Revert/, "Restored"), files: e.files.map((f) => (typeof f === "string" ? f : f.path)) };
  }
}
