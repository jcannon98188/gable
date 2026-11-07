// Source control (TASK-56.25): the pure helpers, and GitService against throwaway repositories in the temp directory (the
// real repository is never touched). The project folder is a subfolder of the repository, as examples/ are.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { groupOf, parseFileDiff, suggestMessage } from "./git.js";
import { GitService } from "./server/git.js";

describe("pure helpers", () => {
  it("groups files by what they are to a project", () => {
    expect(groupOf("src/a/todo-item.ts")).toBe("components");
    expect(groupOf("src/a/todo-item.scenes.ts")).toBe("scenes");
    expect(groupOf("src/styles.css")).toBe("styles");
    expect(groupOf("index.html")).toBe("pages");
    expect(groupOf("package.json")).toBe("config");
    expect(groupOf("public/logo.png")).toBe("other");
  });

  it("splits a diff into its header and hunks, counting lines", () => {
    const text = ["diff --git a/x.ts b/x.ts", "index 1..2 100644", "--- a/x.ts", "+++ b/x.ts", "@@ -1,2 +1,2 @@", " a", "-b", "+c", "@@ -9 +9,2 @@", " z", "+y", ""].join("\n");
    const d = parseFileDiff(text);
    expect(d.header).toHaveLength(4);
    expect(d.hunks.map((h) => [h.header, h.added, h.removed])).toEqual([
      ["@@ -1,2 +1,2 @@", 1, 1],
      ["@@ -9 +9,2 @@", 1, 0],
    ]);
    expect(d.hunks[1]!.text).toBe("@@ -9 +9,2 @@\n z\n+y\n");
    expect(parseFileDiff("diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n").binary).toBe(true);
  });

  it("suggests a commit subject", () => {
    expect(suggestMessage([])).toBe("");
    expect(suggestMessage([{ path: "src/a.ts", status: "modified" }])).toBe("Update a.ts");
    expect(suggestMessage([{ path: "src/a.ts", status: "untracked" }])).toBe("Add a.ts");
    expect(
      suggestMessage([
        { path: "a", status: "modified" },
        { path: "b", status: "modified" },
      ]),
    ).toBe("Update 2 files");
  });
});

let repo = "";
let project = "";
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const write = (rel: string, text: string) => {
  mkdirSync(join(project, rel, ".."), { recursive: true });
  writeFileSync(join(project, rel), text);
};
const read = (rel: string) => readFileSync(join(project, rel), "utf8");
const TWELVE = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n";

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "gable-git-"));
  project = join(repo, "app");
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  write("src/a.ts", TWELVE);
  write("src/b.css", "b {}\n");
  write("src/old.ts", "old\n");
  writeFileSync(join(repo, "outside.txt"), "outside\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("GitService", () => {
  it("reports an empty tree, then changes inside the project only", async () => {
    const g = new GitService(project);
    expect(await g.status()).toMatchObject({ ok: true, files: [], branch: expect.any(String) });
    write("src/a.ts", TWELVE.replace("two", "TWO"));
    write("src/new.scenes.ts", "x\ny\n");
    writeFileSync(join(repo, "outside.txt"), "changed\n");
    const s = await g.status();
    if (!s.ok) throw new Error(s.error);
    expect(s.prefix).toBe("app/");
    expect(s.files.map((f) => [f.path, f.status, f.group, f.added, f.removed])).toEqual([
      ["src/a.ts", "modified", "components", 1, 1],
      ["src/new.scenes.ts", "untracked", "scenes", 2, 0],
    ]);
  });

  it("says plainly when the folder is not a repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gable-nogit-"));
    try {
      const s = await new GitService(dir).status();
      expect(s.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("diffs a file into hunks, and an untracked file as all added", async () => {
    const g = new GitService(project);
    write("src/a.ts", TWELVE.replace("two", "TWO").replace("eleven", "ELEVEN"));
    write("src/n.ts", "hello\n");
    const d = await g.diff("src/a.ts");
    if (!d.ok) throw new Error(d.error);
    expect(d.hunks).toHaveLength(2);
    expect(d.header.join("\n")).toContain("--- a/src/a.ts");
    expect(d.hunkRevert).toBe(true);
    const n = await g.diff("src/n.ts");
    if (!n.ok) throw new Error(n.error);
    expect(n.hunks[0]!.text).toContain("+hello");
    expect(n.hunkRevert).toBe(false);
    expect(await g.diff("src/b.css")).toMatchObject({ ok: false, code: "missing" });
    expect(await g.diff("../outside.txt")).toMatchObject({ ok: false, code: "missing" });
  });

  it("commits exactly the chosen files and leaves the rest changed", async () => {
    const g = new GitService(project);
    write("src/a.ts", "changed\n");
    write("src/b.css", "b { color: red }\n");
    write("src/n.ts", "new\n");
    git("add", "app/src/b.css");
    const r = await g.commit(["src/a.ts", "src/n.ts"], "Change a and add n\n\nbody");
    if (!r.ok) throw new Error(r.error);
    expect(r.subject).toBe("Change a and add n");
    expect(git("show", "--name-only", "--format=%s", "HEAD").split("\n").filter(Boolean)).toEqual(["Change a and add n", "app/src/a.ts", "app/src/n.ts"]);
    const s = await g.status();
    if (!s.ok) throw new Error(s.error);
    expect(s.files.map((f) => [f.path, f.staged])).toEqual([["src/b.css", true]]);
    expect(await g.commit(["src/zzz.ts"], "x")).toMatchObject({ ok: false, code: "missing" });
    expect(await g.commit(["src/b.css"], "  ")).toMatchObject({ ok: false, code: "invalid" });
  });

  it("commits a deletion and a rename", async () => {
    const g = new GitService(project);
    rmSync(join(project, "src/b.css"));
    git("mv", "app/src/old.ts", "app/src/newer.ts");
    const s = await g.status();
    if (!s.ok) throw new Error(s.error);
    expect(s.files.map((f) => [f.path, f.status, f.from])).toEqual([
      ["src/b.css", "deleted", undefined],
      ["src/newer.ts", "renamed", "src/old.ts"],
    ]);
    const r = await g.commit(["src/b.css", "src/newer.ts"], "Tidy");
    if (!r.ok) throw new Error(r.error);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("reverts a hunk, a file and a new file, and puts each back with undo", async () => {
    const g = new GitService(project);
    const both = TWELVE.replace("two", "TWO").replace("eleven", "ELEVEN");
    write("src/a.ts", both);
    write("src/n.ts", "brand new\n");

    const d = await g.diff("src/a.ts");
    if (!d.ok) throw new Error(d.error);
    expect(await g.revertHunk("src/a.ts", 1, "@@ wrong @@")).toMatchObject({ ok: false, code: "conflict" });
    const h = await g.revertHunk("src/a.ts", 1, d.hunks[1]!.header);
    if (!h.ok) throw new Error(h.error);
    expect(read("src/a.ts")).toBe(TWELVE.replace("two", "TWO"));
    expect(await g.status()).toMatchObject({ undo: ["Revert a change in src/a.ts"] });
    expect(await g.undoRevert()).toMatchObject({ ok: true });
    expect(read("src/a.ts")).toBe(both);

    const f = await g.revertFile("src/a.ts");
    if (!f.ok) throw new Error(f.error);
    expect(read("src/a.ts")).toBe(TWELVE);
    expect(await g.undoRevert()).toMatchObject({ ok: true });
    expect(read("src/a.ts")).toBe(both);

    const n = await g.revertFile("src/n.ts");
    if (!n.ok) throw new Error(n.error);
    expect(existsSync(join(project, "src/n.ts"))).toBe(false);
    expect(await g.undoRevert()).toMatchObject({ ok: true });
    expect(read("src/n.ts")).toBe("brand new\n");
    expect(await g.undoRevert()).toMatchObject({ ok: false, code: "nothing" });
  });

  it("reverts a staged new file and a staged change, and restores them staged", async () => {
    const g = new GitService(project);
    write("src/added.ts", "x\n");
    git("add", "app/src/added.ts");
    write("src/b.css", "b { color: blue }\n");
    git("add", "app/src/b.css");
    expect((await g.revertFile("src/added.ts")).ok).toBe(true);
    expect(existsSync(join(project, "src/added.ts"))).toBe(false);
    expect((await g.revertFile("src/b.css")).ok).toBe(true);
    expect(git("status", "--porcelain")).toBe("");
    expect((await g.undoRevert()).ok).toBe(true);
    expect(read("src/b.css")).toBe("b { color: blue }\n");
    expect((await g.undoRevert()).ok).toBe(true);
    expect(git("status", "--porcelain").split("\n").sort()).toEqual(["A  app/src/added.ts", "M  app/src/b.css"]);
  });

  it("works in a repository with no commits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gable-empty-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: dir });
      writeFileSync(join(dir, "a.ts"), "x\n");
      const g = new GitService(dir);
      const s = await g.status();
      if (!s.ok) throw new Error(s.error);
      expect(s.head).toBeNull();
      expect(s.files.map((f) => f.path)).toEqual(["a.ts"]);
      expect((await g.diff("a.ts")).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("handles file names with spaces and brackets, and refuses a hunk revert of a new file", async () => {
    const g = new GitService(project);
    write("src/my file [1].ts", "z\n");
    const s = await g.status();
    if (!s.ok) throw new Error(s.error);
    expect(s.files[0]!.path).toBe("src/my file [1].ts");
    expect(await g.revertHunk("src/my file [1].ts", 0, "@@ -0,0 +1 @@")).toMatchObject({ ok: false, code: "invalid" });
    expect((await g.revertFile("src/my file [1].ts")).ok).toBe(true);
  });
});
