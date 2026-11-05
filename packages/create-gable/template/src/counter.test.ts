import { describe, expect, it } from "vitest";
import { mount } from "@gable/testing";
import { Counter } from "./counter.js";

describe("Counter", () => {
  it("counts up and shows the doubled value", async () => {
    const fixture = mount(Counter);
    expect(fixture.text()).toContain("Count: 0 (doubled: 0)");

    fixture.dispatch(fixture.query("button.inc")!, "click");
    await fixture.flush();

    expect(fixture.text()).toContain("Count: 1 (doubled: 2)");
  });

  it("saves the count to the injected service", async () => {
    const fixture = mount(Counter);
    fixture.dispatch(fixture.query("button.inc")!, "click");
    fixture.dispatch(fixture.query("button.save")!, "click");
    await fixture.flush();

    expect(fixture.query("p.saved")?.children[0]?.text).toBe("Saved: 1");
  });
});
