#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { main } from "./index.js";

const ask = async (question: string) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
};

process.exitCode = await main(
  process.argv.slice(2),
  process.env,
  { stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t), ask },
);
