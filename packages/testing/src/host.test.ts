import { describe, expect, it } from "vitest";
import { html, injectHost } from "@gable/core";
import type { HostRef } from "@gable/core";
import { injectHost as internalInjectHost } from "@gable/core/internal";
import { mount, type TestNode } from "@gable/testing";

describe("injectHost", () => {
  it("is the same function from the public and the internal entry points", () => {
    expect(internalInjectHost).toBe(injectHost);
  });

  it("gives a component's Setup its host node and renderer, so it can decorate its own element", () => {
    let ref: HostRef<TestNode> | undefined;
    class Decorated {
      static meta = { selector: "x-decorated", template: html`<p>hi</p>` };
      host = (ref = injectHost<TestNode>());
      _aria = this.host.renderer.setAttribute(this.host.host, "role", "button");
    }
    const fixture = mount(Decorated);
    expect(ref!.host).toBe(fixture.root);
    expect(fixture.root.attrs.role).toBe("button");
    expect(ref!.renderer.name).toBe("test");
  });

  it("works from a helper called by a field initialiser", () => {
    const useRole = (role: string) => {
      const { renderer, host } = injectHost<TestNode>();
      renderer.setAttribute(host, "role", role);
    };
    class Helper {
      static meta = { selector: "x-helper", template: html`<p></p>` };
      _ = useRole("dialog");
    }
    expect(mount(Helper).root.attrs.role).toBe("dialog");
  });

  it("throws outside a component Setup, including from a method called later", () => {
    expect(() => injectHost()).toThrow(/outside a component Setup/);
    class Late {
      static meta = { selector: "x-late", template: html`<p></p>` };
      open() {
        return injectHost();
      }
    }
    expect(() => mount(Late).instance.open()).toThrow(/outside a component Setup/);
  });
});
