// The panel's request/response client over a transport to the relay. Independent of `chrome.*`.
import type { DevtoolsEvent, DevtoolsMethods, PanelToRelay, RelayToPanel } from "../protocol.js";

export interface Transport {
  send(message: PanelToRelay): void;
  /** Called for each message from the relay; and `onOpen` each time the connection is (re)established. */
  listen(onMessage: (message: RelayToPanel) => void, onOpen: () => void): void;
}

export interface Status {
  detected: boolean;
  version?: number;
}

export interface Client {
  request<M extends keyof DevtoolsMethods>(method: M, params: DevtoolsMethods[M]["params"]): Promise<DevtoolsMethods[M]["result"]>;
  onEvent(listener: (event: DevtoolsEvent) => void): void;
  onStatus(listener: (status: Status) => void): void;
  readonly status: Status;
}

export interface ClientOptions {
  tabId: number;
  /** Milliseconds before a request without an answer fails. */
  timeoutMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: any) => void;
}

export function createClient(transport: Transport, options: ClientOptions): Client {
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: unknown }>();
  const events: Array<(e: DevtoolsEvent) => void> = [];
  const statuses: Array<(s: Status) => void> = [];
  const timers = { set: options.setTimeout ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms)), clear: options.clearTimeout ?? ((h: any) => globalThis.clearTimeout(h)) };
  let nextId = 1;
  let status: Status = { detected: false };

  const failAll = (reason: string) => {
    for (const [id, p] of pending) {
      timers.clear(p.timer);
      p.reject(new Error(reason));
      pending.delete(id);
    }
  };

  transport.listen(
    (message) => {
      switch (message.kind) {
        case "status":
          status = { detected: message.detected, ...(message.version !== undefined ? { version: message.version } : {}) };
          if (!message.detected) failAll("The page went away.");
          else transport.send({ kind: "subscribe" });
          for (const l of statuses) l(status);
          return;
        case "event":
          for (const l of events) l(message.event);
          return;
        case "response": {
          const p = pending.get(message.id);
          if (!p) return;
          pending.delete(message.id);
          timers.clear(p.timer);
          if (message.ok) p.resolve(message.result);
          else p.reject(new Error(message.error));
          return;
        }
        case "ready":
          return;
      }
    },
    () => {
      // (Re)connected to the relay: say which tab this is; the relay answers with the status.
      failAll("The connection to the extension was reset.");
      transport.send({ kind: "panel-init", tabId: options.tabId });
    },
  );

  return {
    get status() {
      return status;
    },
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = timers.set(() => {
          pending.delete(id);
          reject(new Error(`No answer from the page for "${method}".`));
        }, options.timeoutMs ?? 5000);
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        transport.send({ kind: "request", id, method, params });
      });
    },
    onEvent: (l) => void events.push(l),
    onStatus: (l) => void statuses.push(l),
  };
}
