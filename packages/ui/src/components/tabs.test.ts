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

class BadgeApp {
  static meta = {
    selector: "app-root",
    imports: [UiTabs, UiTab],
    template: html`<ui-tabs [(value)]="tab" density="compact">
      <ui-tab value="a" label="Alpha" [badge]="7">A</ui-tab>
      @if (mid()) {
        <ui-tab value="b" label="Beta" badge="new">B</ui-tab>
      }
      <ui-tab value="c" label="Gamma">C</ui-tab>
    </ui-tabs>`,
  };
  tab = signal("");
  mid = signal(false);
}

describe("Tab badge and order", () => {
  const boot = async () => {
    const f = mount(BadgeApp, { providers: provideTestDom(), advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)) });
    await f.settle();
    return f;
  };
  const labels = (f: Awaited<ReturnType<typeof boot>>) => f.queryAll("[role=tab]").map((n) => f.textOf(n).trim().replace(/\s+/g, " "));

  it("shows a badge after the label, inside the trigger, only when set", async () => {
    const f = await boot();
    expect(labels(f)).toEqual(["Alpha 7", "Gamma"]);
    expect(f.queryAll("[data-tab-badge]")).toHaveLength(1);
    expect(f.query("[role=tab] [data-tab-badge]")).not.toBeNull();
  });

  it("keeps a conditional tab in markup order in the buttons and the arrow-key order", async () => {
    const f = await boot();
    f.instance.mid.set(true);
    await f.settle();
    expect(labels(f)).toEqual(["Alpha 7", "Beta new", "Gamma"]);
    const trigger = (v: string) => f.query(`[role=tab][data-value=${v}]`)!;
    focusNode(trigger("a"));
    pressKey(f, f.query("[role=tablist]")!, "ArrowRight", trigger("a"));
    await f.advance(50);
    expect(f.instance.tab()).toBe("b");
    pressKey(f, f.query("[role=tablist]")!, "ArrowRight", trigger("b"));
    await f.advance(50);
    expect(f.instance.tab()).toBe("c");
  });

  it("falls back to the first enabled tab when the selected conditional tab disappears", async () => {
    const f = await boot();
    f.instance.mid.set(true);
    await f.settle();
    f.instance.tab.set("b");
    await f.settle();
    expect(f.query("[role=tab][data-value=b]")!.attrs["aria-selected"]).toBe("true");
    f.instance.mid.set(false);
    await f.settle();
    expect(f.instance.tab()).toBe("a");
    expect(f.query("[role=tab][data-value=a]")!.attrs["aria-selected"]).toBe("true");
  });
});
