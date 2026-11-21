// @vitest-environment jsdom
// An error thrown by renderer.setProperty for a `prop` binding is not swallowed by the binding guard of applyBindings: as before
// canvas/136 inlined that guard, only the expression is guarded, so the failure is not reported as a "binding" error of the guard.
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap, ErrorHandler, flushSync, html, signal } from "@gablejs/core";
import { dom } from "./index.js";

let app: { destroy(): void } | null = null;
afterEach(() => {
  app?.destroy();
  app = null;
});

describe("renderer.setProperty failing for a prop binding", () => {
  it("is not turned into a binding report by the guard", () => {
    const n = signal(1);
    class Probe {
      static meta = { selector: "x-probe", template: html`<p [value]="n()">x</p>` };
      n = n;
    }
    const base = dom();
    const renderer = Object.create(base) as typeof base;
    renderer.setProperty = (node, name, value) => {
      if (name === "value" && value === 2) throw new Error("setProperty failed");
      base.setProperty(node, name, value);
    };
    const reports: Array<{ message: string; source: string }> = [];
    document.body.innerHTML = '<div id="app"></div>';
    app = bootstrap(Probe, {
      renderer,
      target: "#app",
      providers: [{ provide: ErrorHandler, useValue: { handleError: (e: unknown, c: { source: string }) => reports.push({ message: String((e as Error).message), source: c.source }) } }],
    });
    flushSync();
    n.set(2);
    try {
      flushSync();
    } catch {
      // the effect system may rethrow it; either way it is not a guard report
    }
    expect(reports.filter((r) => r.source === "binding")).toEqual([]);
  });
});
