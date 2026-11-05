import { describe, expect, it } from "vitest";
import { packageName } from "@gable/core";

describe("@gable/core", () => {
  it("resolves through its exports map", () => {
    expect(packageName).toBe("@gable/core");
  });
});
