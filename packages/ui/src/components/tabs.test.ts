import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { domEvent, focusNode, pressKey, provideTestDom } from "@gable/ui-primitives/testing";
import { UiTab, UiTabs } from "./tabs.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiTabs, UiTab],
    template: html`<ui-tabs [(value)]="tab">
      <ui-tab value="account" label="Account">Account panel</ui-tab>
      <ui-tab value="password" label="Password">Password panel</ui-tab>
      <ui-tab value="billing" label="Billing" [disabled]="true">Billing panel</ui-tab>
      <ui-tab value="team" label="Team">Team panel</ui-tab>
      @if (extra()) {
        <ui-tab value="extra" label="Extra">Extra panel</ui-tab>
      }
    </ui-tabs>`,
  };
  tab = signal("");
  extra = signal(false);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = async () => {
  const f = mount(App, { providers: provideTestDom(), advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)) });
  await f.settle();
  const trigger = (value: string) => f.query(`[role=tab][data-value=${value}]`)!;
  const panel = (value: string) => f.queryAll("[role=tabpanel]").find((p) => p.attrs["aria-labelledby"]!.endsWith(`trigger-${value}`))!;
  return { f, trigger, panel };
};

describe("Tabs", () => {
  it("draws a trigger per ui-tab and selects the first enabled one by default", async () => {
    const { f, trigger, panel } = await setup();
    expect(f.queryAll("[role=tab]").map((n) => f.textOf(n).trim())).toEqual(["Account", "Password", "Billing", "Team"]);
    expect(trigger("account").attrs).toMatchObject({ "aria-selected": "true", "data-selected": "" });
    expect(trigger("password").attrs["aria-selected"]).toBe("false");
    expect(trigger("billing").attrs.disabled).toBe("");
    expect(panel("account").attrs.hidden).toBeUndefined();
    expect(panel("password").attrs.hidden).toBe("");
    expect(f.text()).toContain("Account panel");
  });

  it("selects on click and writes the two-way value", async () => {
    const { f, trigger, panel } = await setup();
    f.dispatch(trigger("password"), "click", domEvent(trigger("password"), "click"));
    await f.settle();
    expect(f.instance.tab()).toBe("password");
    expect(trigger("password").attrs["aria-selected"]).toBe("true");
    expect(panel("password").attrs.hidden).toBeUndefined();
    expect(panel("account").attrs.hidden).toBe("");
  });

  it("follows a bound value", async () => {
    const { f, trigger } = await setup();
    f.instance.tab.set("team");
    await f.settle();
    expect(trigger("team").attrs["aria-selected"]).toBe("true");
  });

  it("arrow keys skip the disabled tab", async () => {
    const { f, trigger } = await setup();
    focusNode(trigger("password"));
    pressKey(f, f.query("[role=tablist]")!, "ArrowRight", trigger("password"));
    await f.advance(50);
    expect(f.instance.tab()).toBe("team");
  });

  it("picks up a tab that appears after the first render", async () => {
    const { f, trigger } = await setup();
    f.instance.extra.set(true);
    await f.settle();
    expect(f.queryAll("[role=tab]")).toHaveLength(5);
    f.dispatch(trigger("extra"), "click", domEvent(trigger("extra"), "click"));
    await f.settle();
    expect(f.instance.tab()).toBe("extra");
  });
});
