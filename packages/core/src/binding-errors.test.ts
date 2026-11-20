// Error handling of element bindings (canvas/136 inlined the guard of errors.ts into applyBindings; this pins that nothing changed):
// a throwing expression is reported once per failure episode and keeps the last good value, (the renderer.setProperty case is pinned in renderer-dom/src/binding-errors.test.ts).
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";

class Probe {
  static meta = { selector: "x-probe", template: html`<p [attr.title]="read()" [value]="read()">x</p>` };
  n = signal(1);
  boom = signal(false);
  read() {
    if (this.boom()) throw new Error("bad expression");
    return this.n();
  }
}

describe("binding error handling", () => {
  it("reports a throwing expression once per failure episode and keeps the last good value", async () => {
    const f = mount(Probe);
    const flush = () => f.flush().catch(() => {}); // unclaimed binding errors make a flush throw; they are claimed with errors.expect below
    await flush();
    const p = f.root.children[0]!;
    expect(p.attrs.title).toBe("1");
    f.instance.boom.set(true);
    await flush();
    f.instance.n.set(2);
    await flush();
    expect(p.attrs.title).toBe("1");
    expect(f.errors.expect("binding").map((e) => String(e.error))).toEqual(["Error: bad expression", "Error: bad expression"]); // one per prop/attr binding, not per rerun
    f.instance.boom.set(false);
    await flush();
    expect(p.attrs.title).toBe("2");
    f.instance.boom.set(true);
    await flush();
    expect(f.errors.expect("binding")).toHaveLength(2); // a new episode reports again
  });
});
