import { describe, expect, it } from "vitest";
import { InjectionToken, computed, html, inject, input, signal } from "@gable/core";
import { Http } from "@gable/core/http";
import { toSignal } from "@gable/core/rxjs";
import { map } from "rxjs";
import type { ComponentScenes } from "@gable/core/tooling";
import { mountScene } from "./index.js";

const GREETING = new InjectionToken<string>("Greeting");

class Hello {
  static meta = { selector: "app-hello", template: html`<p>{{ greeting }}, {{ name() }}</p>` };
  greeting = inject(GREETING);
  name = input("nobody");
}

const scenes = {
  component: Hello,
  scenes: {
    Default: { providers: [{ provide: GREETING, useValue: "Hello" }] },
    Named: { inputs: { name: "Ada" }, providers: [{ provide: GREETING, useValue: "Hi" }] },
  },
} satisfies ComponentScenes<Hello>;

describe("mountScene", () => {
  it("mounts a scene's inputs and provider overrides", () => {
    expect(mountScene(scenes, "Default").text()).toBe("Hello, nobody");
    expect(mountScene(scenes, "Named").text()).toBe("Hi, Ada");
  });

  it("lets a test override the scene's providers", () => {
    expect(mountScene(scenes, "Named", { providers: [{ provide: GREETING, useValue: "Yo" }] }).text()).toBe("Yo, Ada");
  });

  it("names the scenes when asked for a missing one", () => {
    expect(() => mountScene(scenes, "Nope")).toThrow(/Scenes: Default, Named/);
  });
});

describe("mountScene with http mocks", () => {
  class Loader {
    static meta = { selector: "app-loader", template: html`<p>{{ text() }}</p>` };
    http = inject(Http);
    text = toSignal(this.http.get<{ name: string }>("/api/me").pipe(map((r) => r.name)), { initialValue: "…" });
  }
  const loaderScenes = {
    component: Loader,
    scenes: { Ada: { http: [{ url: "/api/me", reply: { body: { name: "Ada" } } }] } },
  } satisfies ComponentScenes<Loader>;

  it("answers the component's HTTP calls from the scene's mocks, without answering by hand", async () => {
    const f = mountScene(loaderScenes, "Ada");
    await f.settle();
    expect(f.text()).toBe("Ada");
  });
});

describe("mountScene with state", () => {
  class Tally {
    static meta = { selector: "app-tally", template: html`<p>{{ label() }}: {{ count() }} {{ joined() }}</p>` };
    label = input("n");
    count = signal(0);
    items = signal<string[]>([]);
    doubled = computed(() => this.count() * 2);
    joined = computed(() => this.items().join(","));
  }
  const tallyScenes = {
    component: Tally,
    scenes: {
      Busy: { inputs: { label: "busy" }, state: { count: 3, items: ["a", "b"] } },
      Stale: { state: { cuont: 1 } },
      Computed: { state: { doubled: 4 } },
      Input: { state: { label: "x" } },
    },
  } satisfies ComponentScenes<Tally>;

  it("sets the component's writable signals and shows them", () => {
    const f = mountScene(tallyScenes, "Busy");
    expect(f.instance.count()).toBe(3);
    expect(f.text()).toBe("busy: 3 a,b");
  });

  it("names a field that is not a writable signal", () => {
    expect(() => mountScene(tallyScenes, "Stale")).toThrow(/"cuont" of Tally, which is not a writable signal/);
    expect(() => mountScene(tallyScenes, "Computed")).toThrow(/"doubled" of Tally, which is not a writable signal/);
    expect(() => mountScene(tallyScenes, "Input")).toThrow(/"label" of Tally, which is an input or model/);
  });

  it("types the public writable signals", () => {
    // @ts-expect-error count is a number
    const bad: ComponentScenes<Tally> = { component: Tally, scenes: { A: { state: { count: "3" } } } };
    expect(bad).toBeTruthy();
  });
});
