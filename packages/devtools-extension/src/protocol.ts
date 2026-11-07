// The message protocol between the page (the Gable hook), the content script, the service worker relay and the
// devtools panel. Pure types and guards: nothing here touches `chrome.*` or the DOM.
import type { DevtoolsEvent, DevtoolsMethods } from "@gable/core/devtools";

export type { ComponentDetail, DevtoolsEvent, DevtoolsMethods, Edge, EditResult, EffectInfo, EffectRun, FlushRecord, HmrEntry, InjectorDetail, InjectorEntry, InjectorNode, InspectorInfo, Preview, RouteNode, RouterInfo, SignalInfo, TreeNode } from "@gable/core/devtools";

/** `window.postMessage` marker for messages the page's bridge sends toward the extension. */
export const FROM_PAGE = "gable-devtools:page";
/** Marker for messages the content script sends into the page. */
export const TO_PAGE = "gable-devtools:tool";

export const PORT_CONTENT = "gable-content";
export const PORT_PANEL = "gable-panel";

/** Panel to page. */
export type ToPage =
  | { kind: "hello" }
  | { kind: "subscribe" }
  | { kind: "unsubscribe" }
  | { kind: "request"; id: number; method: string; params?: unknown };

/** Page to panel. */
export type FromPage =
  | { kind: "ready"; version: number }
  | { kind: "event"; event: DevtoolsEvent }
  | { kind: "response"; id: number; ok: true; result: unknown }
  | { kind: "response"; id: number; ok: false; error: string };

/** What the panel sends the relay: its tab, then anything addressed to the page. */
export type PanelToRelay = { kind: "panel-init"; tabId: number } | ToPage;

/** What the relay sends the panel: the connection status, then anything the page said. */
export type RelayToPanel = { kind: "status"; detected: boolean; version?: number } | FromPage;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

export function isToPage(x: unknown): x is ToPage {
  if (!isObject(x)) return false;
  switch (x.kind) {
    case "hello":
    case "subscribe":
    case "unsubscribe":
      return true;
    case "request":
      return typeof x.id === "number" && typeof x.method === "string";
    default:
      return false;
  }
}

export function isFromPage(x: unknown): x is FromPage {
  if (!isObject(x)) return false;
  switch (x.kind) {
    case "ready":
      return typeof x.version === "number";
    case "event":
      return isObject(x.event) && typeof x.event.type === "string";
    case "response":
      return typeof x.id === "number" && typeof x.ok === "boolean" && (x.ok || typeof x.error === "string");
    default:
      return false;
  }
}

export function isPanelToRelay(x: unknown): x is PanelToRelay {
  return isToPage(x) || (isObject(x) && x.kind === "panel-init" && typeof x.tabId === "number");
}

/** A `window.postMessage` envelope. */
export interface Envelope<M> {
  source: typeof FROM_PAGE | typeof TO_PAGE;
  message: M;
}

export const envelope = <M>(source: Envelope<M>["source"], message: M): Envelope<M> => ({ source, message });

/** The message inside an envelope of `source`, or undefined. */
export function unwrap(data: unknown, source: Envelope<unknown>["source"]): unknown {
  return isObject(data) && data.source === source ? data.message : undefined;
}
