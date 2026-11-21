// @vitest-environment jsdom
// canvas/135: what survives a hot edit of a canvas game. Scene components live in the host page's template and inject
// page-level services (boundary services such as Frame are not injectable from projected content, ADR 0019).
import { Sprite, type Container } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InjectionToken, flushSync, html, inject, onCleanup, signal } from "@gablejs/core";
import { GableCanvas } from "./index.js";
import { boot, fakeApp, live, manualScheduler, update } from "./hmr-harness.js";

afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const pageTemplate = html`<gable-canvas [options]="options"><app-rock></app-rock></gable-canvas>`;
const rockTemplate = html`<sprite [x]="state.x()"></sprite>`;

function rig() {
  const app = fakeApp();
  const options = { createApplication: () => app.create(), scheduler: manualScheduler().scheduler };
  const collect = (node: Container): Sprite[] => node.children.flatMap((c) => (c instanceof Sprite ? [c] : collect(c as Container)));
  const sprites = () => (app.stages[0]?.children[0] ? collect(app.stages[0].children[0] as Container) : []);
  return { app, options, sprites };
}

describe("root service edits", () => {
  it("adding a field to a root service keeps the Application and GL context, carries service state and rebuilds the scene", async () => {
    const { app, options, sprites } = rig();
    const seen: object[] = [];
    class GameState {
      x = signal(1);
    }
    class Rock {
      static meta = { selector: "app-rock", template: rockTemplate };
      state = inject(GameState);
      _ = seen.push(this);
    }
    class Host {
      static meta = { selector: "app-host", imports: [GableCanvas, Rock], providers: [GameState], template: pageTemplate };
      options = options;
      game = inject(GameState);
    }
    const { ref, target } = boot(Host);
    await vi.waitFor(() => expect(sprites().length).toBe(1));
    const canvas = target.querySelector("canvas")!;
    (ref.instance as Host).game.x.set(7);

    class GameState2 {
      x = signal(1);
      score = signal(0); // the edit: a field added to the root service
    }
    Object.defineProperty(GameState2, "name", { value: "GameState" });
    const before = seen.length;
    const result = update(ref, GameState2);
    expect(result.status).toBe("applied");

    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(before)); // the scene content was rebuilt
    await vi.waitFor(() => expect(target.querySelector("canvas")).toBe(canvas));
    expect(app.log.created).toBe(1);
    expect(app.log.destroyed).toBe(0);
    await vi.waitFor(() => (flushSync(), expect(sprites()[0]!.x).toBe(7))); // the service's state carried over
    expect(sprites().length).toBe(1); // and no duplicate content
  });

  it("keeps a useValue service's object and the Application across a host class edit", async () => {
    const { app, options, sprites } = rig();
    const STATE = new InjectionToken<{ x: ReturnType<typeof signal<number>> }>("STATE");
    const value = { x: signal(3) };
    class Rock {
      static meta = { selector: "app-rock", template: html`<sprite [x]="state.x()"></sprite>` };
      state = inject(STATE);
    }
    const v1 = class Host {
      static meta = { selector: "app-host", imports: [GableCanvas, Rock], providers: [{ provide: STATE, useValue: value }], template: pageTemplate };
      options = options;
    };
    const v2 = class Host {
      static meta = { selector: "app-host", imports: [GableCanvas, Rock], providers: [{ provide: STATE, useValue: value }], template: pageTemplate };
      options = options;
      added = 1;
    };
    const { ref, target } = boot(v1);
    await vi.waitFor(() => expect(sprites().length).toBe(1));
    const canvas = target.querySelector("canvas")!;
    value.x.set(9);

    expect(update(ref, v2).status).toBe("applied");
    await vi.waitFor(() => expect(target.querySelector("canvas")).toBe(canvas));
    expect(app.log.created).toBe(1);
    expect(app.log.destroyed).toBe(0);
    await vi.waitFor(() => (flushSync(), expect(sprites()[0]!.x).toBe(9)));
    expect(value.x()).toBe(9);
  });
});

describe("component field transfer", () => {
  it("transfers a non-cyclic spawnTimer-style field (a number and a plain array) to the rebuilt rock", async () => {
    const { options, sprites } = rig();
    const rocks: Array<{ spawnTimer: number; log: number[] }> = [];
    class State {
      x = signal(0);
    }
    const make = (extra: boolean) =>
      extra
        ? class Rock {
            static meta = { selector: "app-rock", template: rockTemplate };
            state = inject(State);
            spawnTimer = 0;
            log: number[] = [];
            added = 1;
            _ = rocks.push(this);
          }
        : class Rock {
            static meta = { selector: "app-rock", template: rockTemplate };
            state = inject(State);
            spawnTimer = 0;
            log: number[] = [];
            _ = rocks.push(this);
          };
    const v1 = make(false);
    class Host {
      static meta = { selector: "app-host", imports: [GableCanvas, v1], providers: [State], template: pageTemplate };
      options = options;
    }
    const { ref } = boot(Host);
    await vi.waitFor(() => expect(sprites().length).toBe(1));
    rocks[0]!.spawnTimer = 2.5;
    rocks[0]!.log.push(1, 2);

    expect(update(ref, make(true)).status).toBe("applied");
    await vi.waitFor(() => expect(rocks.length).toBe(2));
    expect(rocks[1]).not.toBe(rocks[0]);
    expect(rocks[1]!.spawnTimer).toBe(2.5);
    expect(rocks[1]!.log).toEqual([1, 2]);
  });
});

describe("real timers: component field versus service", () => {
  /** Live setInterval ids, tracked through the real timer functions. */
  function trackIntervals() {
    const ids = new Set<unknown>();
    const set = globalThis.setInterval;
    const clear = globalThis.clearInterval;
    vi.spyOn(globalThis, "setInterval").mockImplementation(((...args: Parameters<typeof set>) => {
      const id = set(...args);
      ids.add(id);
      return id;
    }) as typeof set);
    vi.spyOn(globalThis, "clearInterval").mockImplementation(((id: Parameters<typeof clear>[0]) => {
      ids.delete(id);
      clear(id);
    }) as typeof clear);
    return {
      ids,
      stop() {
        for (const id of ids) clear(id as never);
        ids.clear();
      },
    };
  }

  const hostFor = (Rock: Function, options: object, providers: unknown[] = []) =>
    class Host {
      static meta = { selector: "app-host", imports: [GableCanvas, Rock], providers, template: pageTemplate };
      options = options;
    };

  const State = class State {
    x = signal(0);
  };
  const leaky = (n: number) =>
    new Function("inject", "State", "tpl", `return class Rock { static meta = { selector: "app-rock", template: tpl }; state = inject(State); extra${n} = 1; spawn = setInterval(() => {}, 60000); };`)(inject, State, rockTemplate) as new () => object;
  const tidy = (n: number) =>
    new Function("inject", "State", "tpl", "onCleanup", `return class Rock { static meta = { selector: "app-rock", template: tpl }; state = inject(State); extra${n} = 1; spawn = (() => { const id = setInterval(() => {}, 60000); onCleanup(() => clearInterval(id)); return id; })(); };`)(inject, State, rockTemplate, onCleanup) as new () => object;

  it("a raw interval in a component field leaks one timer per edit", async () => {
    const { options, sprites } = rig();
    const intervals = trackIntervals();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = boot(hostFor(leaky(1), options, [State]));
      await vi.waitFor(() => expect(sprites().length).toBe(1));
      expect(intervals.ids.size).toBe(1);
      expect(update(a.ref, leaky(2)).status).toBe("applied");
      await vi.waitFor(() => expect(sprites().length).toBe(1));
      expect(intervals.ids.size).toBe(2); // the old rock's timer was never cleared
    } finally {
      intervals.stop();
    }
  });

  it("an interval cleared with onCleanup is replaced, not duplicated, by an edit", async () => {
    const { options, sprites } = rig();
    const intervals = trackIntervals();
    try {
      const b = boot(hostFor(tidy(1), options, [State]));
      await vi.waitFor(() => expect(sprites().length).toBe(1));
      expect(intervals.ids.size).toBe(1);
      expect(update(b.ref, tidy(2)).status).toBe("applied");
      await vi.waitFor(() => expect(sprites().length).toBe(1));
      expect(intervals.ids.size).toBe(1); // cleared with the old scope, recreated once
    } finally {
      intervals.stop();
    }
  });

  it("an interval held by a service survives a rock edit without a second timer", async () => {
    const { options, sprites } = rig();
    const intervals = trackIntervals();
    let spawners = 0;
    class Spawner {
      x = signal(0);
      timer = (() => {
        spawners++;
        const id = setInterval(() => {}, 60000);
        onCleanup(() => clearInterval(id));
        return id;
      })();
    }
    const rock = (n: number) =>
      new Function("inject", "Spawner", "tpl", `return class Rock { static meta = { selector: "app-rock", template: tpl }; state = inject(Spawner); extra${n} = 1; };`)(inject, Spawner, rockTemplate) as new () => object;
    try {
      const a = boot(hostFor(rock(1), options, [Spawner]));
      await vi.waitFor(() => expect(sprites().length).toBe(1));
      expect(intervals.ids.size).toBe(1);
      expect(update(a.ref, rock(2)).status).toBe("applied");
      await vi.waitFor(() => expect(sprites().length).toBe(1));
      expect(spawners).toBe(1);
      expect(intervals.ids.size).toBe(1);
    } finally {
      intervals.stop();
    }
  });
});
