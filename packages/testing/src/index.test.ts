import { describe, expect, it } from "vitest";
import { packageName } from "@gable/testing";

describe("@gable/testing", () => {
  it("resolves through its exports map", () => {
    expect(packageName).toBe("@gable/testing");
  });
});
