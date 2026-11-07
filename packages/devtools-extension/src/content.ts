// The isolated-world content script: relays between the page bridge (window messages) and the service worker (a port).
import { FROM_PAGE, TO_PAGE, envelope, isFromPage, isToPage, unwrap } from "./protocol.js";

/** The slice of `window` and `chrome.runtime` the relay uses. */
export interface ContentEnv {
  win: {
    addEventListener(type: string, listener: (event: any) => void): void;
    postMessage(message: unknown, targetOrigin: string): void;
  };
  connect(): { postMessage(message: unknown): void; onMessage: { addListener(cb: (m: unknown) => void): void }; onDisconnect: { addListener(cb: () => void): void } };
  /** Delay before reconnecting after the service worker went away. */
  retryMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

export function startContent(env: ContentEnv): void {
  const later = env.setTimeout ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  let port: ReturnType<ContentEnv["connect"]> | null = null;
  let lastReady: unknown = null;

  const toPage = (message: unknown) => env.win.postMessage(envelope(TO_PAGE, message), "*");

  const open = () => {
    try {
      port = env.connect();
    } catch {
      return; // the extension was reloaded: this content script is orphaned
    }
    port.onMessage.addListener((message) => {
      if (isToPage(message)) toPage(message);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      later(open, env.retryMs ?? 500);
    });
    // Announce the page again: a restarted worker forgot it. Without an announcement yet, ask the page for one.
    if (lastReady) port.postMessage(lastReady);
    else toPage({ kind: "hello" });
  };

  env.win.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== env.win) return;
    const message = unwrap(event.data, FROM_PAGE);
    if (!isFromPage(message)) return;
    if (message.kind === "ready") lastReady = message;
    port?.postMessage(message);
  });

  open();
}
