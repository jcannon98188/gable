import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/canvas.md embeds these example files verbatim, so the code a reader copies is the code the tests run.
const guide = readFileSync(new URL("../../../../docs/canvas.md", import.meta.url), "utf8");
const embedded = ["entities.test.ts", "entities.ts", "frame.ts", "input.ts", "assets.ts", "a11y.ts", "hmr.ts", "perf.ts", "known.test.ts"];

describe("docs/canvas.md", () => {
  it.each(embedded)("embeds %s exactly as the tested file", (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8").trimEnd();
    expect(guide).toContain("```ts\n" + source + "\n```");
  });

  it("includes the accessibility checklist, the known behaviours and the published numbers", () => {
    for (const needle of [
      "Label the host",
      "Mark every interactive node with `[a11y]`",
      "Announce meaningful state changes",
      "non-pointer route",
      "Keep the HUD in the DOM",
      "colour alone",
      "ADR 0019",
      "GABLE_GOLDEN=1",
      "GABLE_BROWSER_SMOKE=1",
      "0.75 microseconds",
      "18.4",
      "22.2 ms to 15.9 ms",
    ]) {
      expect(guide).toContain(needle);
    }
  });
});
