import { describe, expect, it } from "vitest";
import { InjectionToken, html, inject, type Provider } from "@gable/core";
import { createTestInjector, mount } from "@gable/testing";

class Logger {
  static scope = "root";
  lines: string[] = [];
}

class Greeter {
  static scope = "root";
  logger = inject(Logger);
}

const NAME = new InjectionToken<string>("name");

describe("providers and inject (createTestInjector)", () => {
  it("resolves a root-scoped service class with no explicit provider, as a singleton", () => {
    const injector = createTestInjector();
    const greeter = injector.run(() => inject(Greeter));
    expect(greeter.logger).toBe(injector.run(() => inject(Logger)));
    expect(injector.run(() => inject(Greeter))).toBe(greeter);
  });

  it("requires an explicit provider for classes without root scope", () => {
    class Plain {}
    expect(() => createTestInjector().run(() => inject(Plain))).toThrow(/No provider for Plain/);
    expect(createTestInjector([Plain]).run(() => inject(Plain))).toBeInstanceOf(Plain);
  });

  it("supports useValue, useFactory, useClass and useExisting", () => {
    class Fake extends Logger {}
    const ALIAS = new InjectionToken<Logger>("alias");
    const providers: Provider[] = [
      { provide: NAME, useValue: "gable" },
      { provide: Logger, useClass: Fake },
      { provide: Greeter, useFactory: () => ({ hi: `hi ${inject(NAME)}` }) },
      { provide: ALIAS, useExisting: Logger },
    ];
    const injector = createTestInjector(providers);
    expect(injector.run(() => inject(NAME))).toBe("gable");
    expect(injector.run(() => inject(Logger))).toBeInstanceOf(Fake);
    expect(injector.run(() => inject(Greeter))).toEqual({ hi: "hi gable" });
    expect(injector.run(() => inject(ALIAS))).toBe(injector.run(() => inject(Logger)));
  });

  it("runs useFactory lazily and once", () => {
    let calls = 0;
    const injector = createTestInjector([{ provide: NAME, useFactory: () => (calls++, "x") }]);
    expect(calls).toBe(0);
    injector.run(() => (inject(NAME), inject(NAME)));
    expect(calls).toBe(1);
  });

  it("throws for inject outside an injection context", () => {
    expect(() => inject(NAME)).toThrow(/injection context/);
  });

  it("detects circular dependencies", () => {
    const A = new InjectionToken<unknown>("A");
    const B = new InjectionToken<unknown>("B");
    const injector = createTestInjector([
      { provide: A, useFactory: () => inject(B) },
      { provide: B, useFactory: () => inject(A) },
    ]);
    expect(() => injector.run(() => inject(A))).toThrow(/Circular dependency/);
  });

  it("optional returns null instead of throwing", () => {
    expect(createTestInjector().run(() => inject(NAME, { optional: true }))).toBeNull();
  });

  it("lets later test providers override defaults", () => {
    const injector = createTestInjector([{ provide: Logger, useValue: { lines: ["fake"] } }]);
    expect(injector.run(() => inject(Logger)).lines).toEqual(["fake"]);
  });
});

describe("child injectors", () => {
  const parent = () => createTestInjector([{ provide: NAME, useValue: "parent" }]);

  it("shadow parents and fall back to them", () => {
    const p = parent();
    const child = p.createChild([{ provide: NAME, useValue: "child" }]);
    const other = p.createChild([]);
    expect(child.run(() => inject(NAME))).toBe("child");
    expect(other.run(() => inject(NAME))).toBe("parent");
    expect(p.run(() => inject(NAME))).toBe("parent");
  });

  it("skipSelf skips the current injector", () => {
    const child = parent().createChild([{ provide: NAME, useValue: "child" }]);
    expect(child.run(() => inject(NAME, { skipSelf: true }))).toBe("parent");
  });

  it("self only looks at the current injector", () => {
    const child = parent().createChild([]);
    expect(() => child.run(() => inject(NAME, { self: true }))).toThrow(/No provider/);
    expect(child.run(() => inject(NAME, { self: true, optional: true }))).toBeNull();
  });

  it("host stops at the host injector boundary", () => {
    const root = parent();
    const hostInjector = root.createChild([{ provide: Logger, useValue: "host-logger" }], { host: true });
    const inner = hostInjector.createChild([]);
    expect(inner.run(() => inject(Logger, { host: true }))).toBe("host-logger");
    expect(inner.run(() => inject(NAME, { host: true, optional: true }))).toBeNull();
    expect(inner.run(() => inject(NAME))).toBe("parent");
  });

  it("root-scoped services live in the root injector even when requested from a child", () => {
    const root = createTestInjector();
    const child = root.createChild([]);
    expect(child.run(() => inject(Logger))).toBe(root.run(() => inject(Logger)));
  });

  it("a child provider for a root service shadows it, with its own dependencies from the child", () => {
    const root = createTestInjector();
    const child = root.createChild([Greeter, { provide: Logger, useValue: { lines: ["child"] } }]);
    expect(child.run(() => inject(Greeter)).logger.lines).toEqual(["child"]);
    expect(root.run(() => inject(Greeter)).logger.lines).toEqual([]);
  });

  it("destroying an injector destroys children and refuses further use", () => {
    const root = createTestInjector();
    const child = root.createChild([]);
    expect(child.destroyed).toBe(false);
    root.destroy();
    expect(child.destroyed).toBe(true);
    expect(() => child.run(() => inject(Logger))).toThrow(/destroyed/);
  });
});

describe("no constructors (dev)", () => {
  it("rejects a service class with a constructor when it is instantiated", () => {
    class Bad {
      static scope = "root";
      constructor() {
        this.x = 1;
      }
      x: number;
    }
    expect(() => createTestInjector().run(() => inject(Bad))).toThrow(/constructor/i);
    expect(() => createTestInjector([Bad]).run(() => inject(Bad))).toThrow(/constructor/i);
    expect(() => createTestInjector([{ provide: Bad, useClass: Bad }]).run(() => inject(Bad))).toThrow(/constructor/i);
  });

  it("accepts classes with field initialisers and methods that merely mention constructor", () => {
    class Ok {
      static scope = "root";
      n = 1;
      kind() {
        return this.constructor.name;
      }
    }
    expect(createTestInjector().run(() => inject(Ok)).kind()).toBe("Ok");
  });
});

describe("components and injectors", () => {
  class Counter {
    static scope = "root";
    n = 1;
  }
  class Uses {
    static meta = { selector: "app-uses", template: html`<b>{{ label() }}</b>` };
    counter = inject(Counter);
    label = () => `n=${this.counter.n}`;
  }
  class Shadows {
    static meta = {
      selector: "app-shadows",
      template: html`<b>{{ label() }}</b>`,
      providers: [{ provide: Counter, useValue: { n: 42 } }],
    };
    counter = inject(Counter);
    label = () => `n=${this.counter.n}`;
  }

  it("injects into component field initialisers from the mount injector", () => {
    const fixture = mount(Uses, { providers: [{ provide: Counter, useValue: { n: 7 } }] });
    expect(fixture.text()).toBe("n=7");
  });

  it("meta.providers creates a child injector that shadows the parent", () => {
    expect(mount(Shadows).text()).toBe("n=42");
  });
});

describe("component constructors (dev)", () => {
  it("rejects a component with a constructor at mount", () => {
    class Bad {
      static meta = { selector: "app-bad", template: html`<i></i>` };
      constructor() {}
    }
    expect(() => mount(Bad)).toThrow(/constructor/i);
  });
});
