// The service worker's relay: pure logic over abstract ports, so it can be tested without a browser.
import { PORT_CONTENT, PORT_PANEL, isFromPage, isPanelToRelay, type PanelToRelay, type RelayToPanel, type ToPage } from "./protocol.js";

/** The slice of `chrome.runtime.Port` the relay uses. */
export interface RelayPort {
  name: string;
  sender?: { tab?: { id?: number } };
  postMessage(message: unknown): void;
  onMessage: { addListener(cb: (message: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

/** The toolbar badge: shown on tabs where a Gable app (dev build) answered. */
export interface Badge {
  set(tabId: number, detected: boolean): void;
}

interface TabState {
  content: RelayPort | null;
  panels: Set<RelayPort>;
  /** Panels that asked for events; the page keeps one hook subscription while this is not empty. */
  subscribed: Set<RelayPort>;
  ready: { version: number } | null;
}

export class Relay {
  #tabs = new Map<number, TabState>();

  constructor(private readonly badge: Badge) {}

  #tab(id: number): TabState {
    let t = this.#tabs.get(id);
    if (!t) this.#tabs.set(id, (t = { content: null, panels: new Set(), subscribed: new Set(), ready: null }));
    return t;
  }

  /** Wire this to `chrome.runtime.onConnect`. */
  connect(port: RelayPort): void {
    if (port.name === PORT_CONTENT) this.#content(port);
    else if (port.name === PORT_PANEL) this.#panel(port);
  }

  #content(port: RelayPort): void {
    const tabId = port.sender?.tab?.id;
    if (tabId === undefined) return;
    const tab = this.#tab(tabId);
    tab.content = port;
    // A fresh page connection (navigation, reload): re-establish the hook subscription if a panel is watching.
    if (tab.subscribed.size > 0) port.postMessage({ kind: "subscribe" } satisfies ToPage);
    port.onMessage.addListener((message) => {
      if (!isFromPage(message)) return;
      if (message.kind === "ready") {
        tab.ready = { version: message.version };
        this.badge.set(tabId, true);
        for (const p of tab.panels) p.postMessage({ kind: "status", detected: true, version: message.version } satisfies RelayToPanel);
        return;
      }
      for (const p of tab.panels) p.postMessage(message);
    });
    port.onDisconnect.addListener(() => {
      if (tab.content !== port) return; // a newer connection replaced it
      tab.content = null;
      tab.ready = null;
      this.badge.set(tabId, false);
      for (const p of tab.panels) p.postMessage({ kind: "status", detected: false } satisfies RelayToPanel);
    });
  }

  #panel(port: RelayPort): void {
    let tab: TabState | null = null;
    port.onMessage.addListener((raw) => {
      if (!isPanelToRelay(raw)) return;
      const message: PanelToRelay = raw;
      if (message.kind === "panel-init") {
        tab = this.#tab(message.tabId);
        tab.panels.add(port);
        port.postMessage({ kind: "status", detected: tab.ready !== null, ...(tab.ready ? { version: tab.ready.version } : {}) } satisfies RelayToPanel);
        // Ask the page to announce itself in case this worker missed it.
        tab.content?.postMessage({ kind: "hello" } satisfies ToPage);
        return;
      }
      if (!tab) return;
      if (message.kind === "subscribe" || message.kind === "unsubscribe") this.#subscribe(tab, port, message.kind === "subscribe");
      else tab.content?.postMessage(message);
    });
    port.onDisconnect.addListener(() => {
      if (!tab) return;
      tab.panels.delete(port);
      this.#subscribe(tab, port, false);
    });
  }

  #subscribe(tab: TabState, port: RelayPort, on: boolean): void {
    const before = tab.subscribed.size;
    if (on) tab.subscribed.add(port);
    else tab.subscribed.delete(port);
    if (before === 0 && tab.subscribed.size > 0) tab.content?.postMessage({ kind: "subscribe" } satisfies ToPage);
    else if (before > 0 && tab.subscribed.size === 0) tab.content?.postMessage({ kind: "unsubscribe" } satisfies ToPage);
  }
}
