import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";

class Form {
  static meta = {
    selector: "app-form",
    template: html`
      <input class="t" (input)="text.set($event.target.value)" (keydown)="onKey($event)" />
      <input class="c" type="checkbox" (change)="on.set($event.target.checked)" />
      <select class="s" (change)="pick.set($event.target.value)"></select>
      <p class="out"><b>{{ text() }}</b>-<i>{{ keys() }}</i>-{{ on() }}-{{ pick() }}</p>
    `,
  };
  text = signal("");
  keys = signal("");
  on = signal(false);
  pick = signal("");
  prevented = false;
  onKey(e: KeyboardEvent) {
    this.keys.update((k) => k + e.key + (e.shiftKey ? "!" : "") + ((e.target as HTMLInputElement).value ?? ""));
    if (e.key === "Enter") {
      e.preventDefault();
      this.prevented = e.defaultPrevented;
    }
  }
}

describe("event helpers", () => {
  it("textOf reads the deep text of any node", async () => {
    const f = mount(Form);
    f.type(f.query(".t")!, "hi");
    await f.settle();
    expect(f.textOf(f.query(".out")!)).toBe("hi--false-");
    expect(f.textOf(f.query(".out b")!)).toBe("hi");
    f.destroy();
  });

  it("type fires input with $event.target.value", async () => {
    const f = mount(Form);
    const input = f.query(".t")!;
    f.type(input, "abc");
    expect(f.instance.text()).toBe("abc");
    expect(input.props.value).toBe("abc");
    f.destroy();
  });

  it("keydown carries key, modifiers and a live target", () => {
    const f = mount(Form);
    const input = f.query(".t")!;
    f.type(input, "x");
    f.keydown(input, "a", { shiftKey: true });
    f.keydown(input, "Enter");
    expect(f.instance.keys()).toBe("a!xEnterx");
    expect(f.instance.prevented).toBe(true);
    f.destroy();
  });

  it("change sets checked or value on the target", () => {
    const f = mount(Form);
    f.change(f.query(".c")!, true);
    f.change(f.query(".s")!, "b");
    expect(f.instance.on()).toBe(true);
    expect(f.instance.pick()).toBe("b");
    f.destroy();
  });
});
