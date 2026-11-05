import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { main } from "../src/cli.js";

export const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

export interface Reported {
  file: string;
  line: number;
  column: number;
  rule: string;
  severity: "warn" | "error";
  message: string;
}

const runs = new Map<string, ReturnType<typeof run>>();
/** Runs gable-check on a fixture project once and captures its output. */
export const check = (name: string) => runs.get(name) ?? (runs.set(name, run(name)), runs.get(name)!);

async function run(name: string) {
  let out = "";
  let err = "";
  const code = await main(["--project", fixture(name), "--format", "json"], { stdout: (s) => (out += s), stderr: (s) => (err += s) });
  return { code, diagnostics: out ? (JSON.parse(out) as Reported[]) : [], err };
}

/** 1-based line and column of the first occurrence of `snippet` (plus `into` characters) in a fixture source file. */
export function where(name: string, snippet: string, into = 0, file = "app.ts") {
  const text = readFileSync(`${fixture(name)}/src/${file}`, "utf8");
  const at = text.indexOf(snippet);
  expect(at, `${snippet} in fixture`).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, at + into).split("\n");
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
}
