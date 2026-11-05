import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scaffold } from "./index.js";

const repo = fileURLToPath(new URL("../../..", import.meta.url));

// Everything @gable/* the starter installs. Nothing is published, so the CI test packs these from the workspace
// and installs the starter from the tarballs (see docs/manual-setup.md, "Trying unpublished builds").
const PACKAGES = ["core", "renderer-dom", "testing", "vite", "language-service", "prettier-plugin", "template-format"];

const run = (cmd: string, cwd: string) => {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe", env: { ...process.env, npm_config_user_agent: undefined } });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(`${cmd} failed in ${cwd}
${e.stdout ?? ""}
${e.stderr ?? ""}`);
  }
};

let work: string;
let project: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "create-gable-"));
  run("npm run build", repo);
  const tarballs: Record<string, string> = {};
  mkdirSync(join(work, "tarballs"));
  for (const name of PACKAGES) {
    const file = run(`npm pack ./packages/${name} --pack-destination "${join(work, "tarballs")}" --silent`, repo).trim().split("\n").pop()!;
    tarballs[`@gable/${name}`] = `file:${join(work, "tarballs", file).split(sep).join("/")}`;
  }
  project = join(work, "my-app");
  scaffold({ name: "my-app", targetDir: project });
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  for (const key of ["dependencies", "devDependencies"]) {
    for (const dep of Object.keys(manifest[key] ?? {})) if (dep in tarballs) manifest[key][dep] = tarballs[dep];
  }
  manifest.overrides = tarballs; // @gable/* packages depend on each other at the lockstep version
  writeFileSync(join(project, "package.json"), JSON.stringify(manifest, null, 2));
  run("npm install --no-audit --no-fund", project);
}, 600_000);

afterAll(() => rmSync(work, { recursive: true, force: true, maxRetries: 5 }));

describe("the scaffolded starter", () => {
  it("passes check, test and build, and the production bundle has no HMR code", { timeout: 300_000 }, () => {
    run("npm run check", project);
    run("npx prettier --check src vite.config.ts", project); // the starter is already formatted, templates included
    expect(run("npm test", project)).toMatch(/passed/);
    run("npm run build", project);

    const assets = join(project, "dist/assets");
    const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
    expect(js.length).toBeGreaterThan(0);
    const code = js.map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
    expect(code).toContain("Count"); // the sample app itself is bundled
    expect(code).not.toMatch(/import\.meta\.hot|__gableHmr|__gableSelf|applyUpdate|registerModule|dev-hooks|hooks\.current/);
    const css = readdirSync(assets).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
    expect(css).toMatch(/tailwindcss/i);
  });
});
