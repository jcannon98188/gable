// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { bootstrap } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { dom } from "@gable/renderer-dom";
import { expectNoA11yViolations, a11yViolations } from "@gable/testing/a11y";
import { mount } from "@gable/testing";

class Good {
  static meta = { selector: "good-app", template: html`<button>Save</button>` };
}
class Bad {
  static meta = { selector: "bad-app", template: html`<button></button><img src="x.png" />` };
}

const boot = async (C: any) => {
  document.body.innerHTML = '<div id="app"></div>';
  const app = bootstrap(C, { renderer: dom(), target: "#app" });
  await whenFlushed();
  return document.getElementById("app")!;
};

describe("expectNoA11yViolations", () => {
  it("passes for accessible DOM", async () => {
    await expectNoA11yViolations(await boot(Good));
  });

  it("fails with a readable report", async () => {
    const host = await boot(Bad);
    const err = await expectNoA11yViolations(host).then(() => null, (e: Error) => e);
    expect(err?.message).toMatch(/accessibility violations?:/);
    expect(err?.message).toContain("button-name");
    expect(err?.message).toContain("image-alt");
    expect(err?.message).toContain("<button");
  });

  it("honours disableRules", async () => {
    const host = await boot(Bad);
    await expectNoA11yViolations(host, { disableRules: ["button-name", "image-alt"] });
    expect((await a11yViolations(host)).map((v) => v.id).sort()).toEqual(["button-name", "image-alt"]);
  });

  it("fails clearly with the in-memory renderer", async () => {
    const fixture = mount(Good);
    await expect(expectNoA11yViolations(fixture)).rejects.toThrow(/in-memory test renderer/);
  });
});
