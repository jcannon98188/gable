import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computed, effect, html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { createDevtools, type DevtoolsInstance } from "@gable/core/devtools";
import {
  FROM_PAGE,
  PORT_CONTENT,
  PORT_PANEL,
  TO_PAGE,
  envelope,
  isFromPage,
  isPanelToRelay,
  isToPage,
  unwrap,
  type RelayToPanel,
} from "./protocol.js";
import { startBridge, type BridgeWindow } from "./bridge.js";
import { startContent } from "./content.js";
import { Relay, type RelayPort } from "./relay.js";
import { createClient, type Transport } from "./panel/client.js";
import { createPanel } from "./panel/model.js";

const tick = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("protocol guards", () => {
  it("accepts well-formed messages and rejects the rest", () => {
    expect(isToPage({ kind: "hello" })).toBe(true);
    expect(isToPage({ kind: "request", id: 1, method: "tree" })).toBe(true);
    expect(isToPage({ kind: "request", id: "1", method: "tree" })).toBe(false);
    expect(isToPage({ kind: "nope" })).toBe(false);
    expect(isToPage(null)).toBe(false);
    expect(isFromPage({ kind: "ready", version: 1 })).toBe(true);
    expect(isFromPage({ kind: "ready" })).toBe(false);
    expect(isFromPage({ kind: "event", event: { type: "tree" } })).toBe(true);
    expect(isFromPage({ kind: "response", id: 1, ok: false, error: "x" })).toBe(true);
    expect(isFromPage({ kind: "response", id: 1, ok: false })).toBe(false);
    expect(isPanelToRelay({ kind: "panel-init", tabId: 3 })).toBe(true);
    expect(isPanelToRelay({ kind: "panel-init" })).toBe(false);
  });

  it("only unwraps envelopes from the expected side", () => {
    const e = envelope(FROM_PAGE, { kind: "hello" });
    expect(unwrap(e, FROM_PAGE)).toEqual({ kind: "hello" });
    expect(unwrap(e, TO_PAGE)).toBeUndefined();
    expect(unwrap("text", FROM_PAGE)).toBeUndefined();
  });
});

// A window whose postMessage delivers to its own listeners, as a real one does.
function fakeWindow() {
  const listeners = new Map<string, Array<(e: any) => void>>();
  const win: any = {
    addEventListener(type: string, l: (e: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), l]);
    },
    postMessage(data: unknown) {
      queueMicrotask(() => (listeners.get("message") ?? []).forEach((l) => l({ source: win, data })));
    },
    fire(type: string) {
      (listeners.get(type) ?? []).forEach((l) => l({}));
    },
  };
  return win as BridgeWindow & { fire(type: string): void };
}

/** Two linked port ends; messages cross on a microtask. */
function portPair(name: string, sender?: RelayPort["sender"]) {
  const make = () => {
    const msg: Array<(m: unknown) => void> = [];
    const dis: Array<() => void> = [];
    return { msg, dis };
  };
  const a = make();
  const b = make();
  const end = (mine: ReturnType<typeof make>, other: ReturnType<typeof make>, extra: object) => ({
    name,
    ...extra,
    sent: [] as unknown[],
    postMessage(m: unknown) {
      (this as any).sent.push(m);
      queueMicrotask(() => other.msg.forEach((l) => l(m)));
    },
    onMessage: { addListener: (l: (m: unknown) => void) => void mine.msg.push(l) },
    onDisconnect: { addListener: (l: () => void) => void mine.dis.push(l) },
    disconnect() {
      other.dis.forEach((l) => l());
      mine.dis.forEach((l) => l());
    },
  });
  return { relaySide: end(a, b, sender ? { sender } : {}), clientSide: end(b, a, {}) };
}

describe("relay", () => {
  it("badges tabs, forwards between panel and content, and counts subscriptions", async () => {
    const badges: Array<[number, boolean]> = [];
    const relay = new Relay({ set: (t, d) => void badges.push([t, d]) });
    const content = portPair(PORT_CONTENT, { tab: { id: 7 } });
    relay.connect(content.relaySide);
    content.clientSide.postMessage({ kind: "ready", version: 1 });
    await tick();
    expect(badges).toEqual([[7, true]]);

    const p1 = portPair(PORT_PANEL);
    const p2 = portPair(PORT_PANEL);
    relay.connect(p1.relaySide);
    relay.connect(p2.relaySide);
    p1.clientSide.postMessage({ kind: "panel-init", tabId: 7 });
    p2.clientSide.postMessage({ kind: "panel-init", tabId: 7 });
    await tick();
    // The panel hears the status first
    const fromRelay = (p: ReturnType<typeof portPair>) => (p.relaySide as any).sent as RelayToPanel[];
    expect(fromRelay(p1)[0]).toEqual({ kind: "status", detected: true, version: 1 });

    p1.clientSide.postMessage({ kind: "subscribe" });
    p2.clientSide.postMessage({ kind: "subscribe" });
    await tick();
    const sentToPage = (content.relaySide as any).sent as Array<{ kind: string }>;
    expect(sentToPage.filter((m) => m.kind === "subscribe")).toHaveLength(1);
    p1.clientSide.postMessage({ kind: "unsubscribe" });
    await tick();
    expect(sentToPage.some((m) => m.kind === "unsubscribe")).toBe(false);
    p2.clientSide.disconnect();
    await tick();
    expect(sentToPage.filter((m) => m.kind === "unsubscribe")).toHaveLength(1);

    // Page events fan out to the panels, and a vanished page clears the badge.
    content.clientSide.postMessage({ kind: "event", event: { type: "tree" } });
    await tick();
    expect(fromRelay(p1).at(-1)).toEqual({ kind: "event", event: { type: "tree" } });
    content.clientSide.disconnect();
    await tick();
    expect(badges.at(-1)).toEqual([7, false]);
    expect(fromRelay(p1).at(-1)).toEqual({ kind: "status", detected: false });
  });

  it("ignores malformed and unaddressed messages", async () => {
    const relay = new Relay({ set() {} });
    const p = portPair(PORT_PANEL);
    relay.connect(p.relaySide);
    p.clientSide.postMessage({ kind: "request", id: 1, method: "tree" }); // before panel-init
    p.clientSide.postMessage("garbage");
    await tick();
    expect((p.relaySide as any).sent).toEqual([]);
  });
});

describe("end to end: page hook, bridge, content script, relay, client, panel", () => {
  let dt: DevtoolsInstance;
  const target: { __GABLE_DEVTOOLS_HOOK__?: any } = {};
  beforeEach(() => {
    dt = createDevtools(target);
  });
  afterEach(() => dt.dispose());

  class Counter {
    static meta = { selector: "app-counter", template: html`<p>{{ doubled() }}</p>` };
    count = signal(2);
    doubled = computed(() => this.count() * 2);
    _log = effect(() => void this.count());
  }

  function wire() {
    const win = fakeWindow();
    (win as any).__GABLE_DEVTOOLS_HOOK__ = dt.hook;
    startBridge(win);
    const relay = new Relay({ set() {} });
    const content = portPair(PORT_CONTENT, { tab: { id: 1 } });
    relay.connect(content.relaySide);
    startContent({ win, connect: () => content.clientSide as any });
    const panelPort = portPair(PORT_PANEL);
    relay.connect(panelPort.relaySide);
    const transport: Transport = {
      send: (m) => panelPort.clientSide.postMessage(m),
      listen(onMessage, onOpen) {
        panelPort.clientSide.onMessage.addListener((m) => onMessage(m as RelayToPanel));
        onOpen();
      },
    };
    const client = createClient(transport, { tabId: 1 });
    const panel = createPanel(client, {
      evalInPage: async (expr) => {
        return expr.includes("componentFor") ? dt.hook.componentFor(f.root) : undefined;
      },
    });
    let f!: ReturnType<typeof mount>;
    return { panel, setFixture: (x: typeof f) => void (f = x), client };
  }

  it("shows the tree and live signal values, and writes a signal from the panel", async () => {
    const f = mount(Counter);
    const { panel, setFixture, client } = wire();
    setFixture(f);
    await tick(12);
    expect(client.status.detected).toBe(true);
    await panel.refresh();
    expect(panel.state.tree.map((n) => n.name)).toEqual(["Counter"]);
    expect(panel.state.detail?.signals.map((s) => s.name).sort()).toEqual(["count", "doubled"]);

    const count = panel.state.detail!.signals.find((s) => s.name === "count")!;
    panel.startEdit(count.id, "5");
    await panel.commitEdit();
    expect(panel.state.message).toBeNull();
    expect(panel.state.detail!.signals.find((s) => s.name === "doubled")!.value.s).toBe("10");

    await panel.focusSignal(count.id);
    expect(panel.state.focus?.sinks.map((e) => e.name)).toContain("doubled");

    panel.startEdit(count.id, "{bad");
    await panel.commitEdit();
    expect(panel.state.message?.kind).toBe("error");
    expect(panel.state.editing).not.toBeNull();
  });

  it("selects a component from the Elements panel and records effect flushes", async () => {
    const f = mount(Counter);
    const { panel, setFixture } = wire();
    setFixture(f);
    await tick(12);
    await panel.setTab("effects");
    (f.instance as Counter).count.set(9);
    await tick(12);
    expect(panel.state.effects.length).toBeGreaterThan(0);
    await panel.setTab("components");
    await panel.pickFromElements();
    expect(panel.state.selected).toBe(dt.hook.componentFor(f.root));
  });
});
