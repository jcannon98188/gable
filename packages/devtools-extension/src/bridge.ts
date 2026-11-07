// Runs in the page's own JavaScript world (a `world: "MAIN"` content script). Connects to the Gable hook and
// speaks the protocol over `window.postMessage`; the isolated content script relays it to the extension.
import { FROM_PAGE, TO_PAGE, envelope, isToPage, unwrap, type FromPage, type ToPage } from "./protocol.js";
import type { DevtoolsEvent, GableDevtoolsHook } from "@gable/core/devtools";

/** The slice of `window` the bridge uses. */
export interface BridgeWindow {
  __GABLE_DEVTOOLS_HOOK__?: GableDevtoolsHook;
  addEventListener(type: string, listener: (event: any) => void): void;
  postMessage(message: unknown, targetOrigin: string): void;
}

/** Starts the bridge; it attaches as soon as the hook exists (now, or when the framework announces it). */
export function startBridge(win: BridgeWindow): void {
  let hook: GableDevtoolsHook | undefined;
  let off: (() => void) | null = null;
  const send = (message: FromPage) => win.postMessage(envelope(FROM_PAGE, message), "*");

  const attach = () => {
    if (hook || !win.__GABLE_DEVTOOLS_HOOK__) return;
    hook = win.__GABLE_DEVTOOLS_HOOK__;
    send({ kind: "ready", version: hook.version });
  };

  const handle = (message: ToPage) => {
    switch (message.kind) {
      case "hello":
        if (hook) send({ kind: "ready", version: hook.version });
        else attach();
        return;
      case "subscribe":
        if (hook && !off) off = hook.connect((event: DevtoolsEvent) => send({ kind: "event", event }));
        return;
      case "unsubscribe":
        off?.();
        off = null;
        return;
      case "request": {
        if (!hook) return send({ kind: "response", id: message.id, ok: false, error: "The Gable hook is not installed on this page." });
        try {
          Promise.resolve((hook.call as (m: string, p: unknown) => unknown)(message.method, message.params)).then(
            (result) => send({ kind: "response", id: message.id, ok: true, result }),
            (error) => send({ kind: "response", id: message.id, ok: false, error: String(error?.message ?? error) }),
          );
        } catch (error) {
          send({ kind: "response", id: message.id, ok: false, error: String((error as Error)?.message ?? error) });
        }
      }
    }
  };

  win.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== win) return;
    const message = unwrap(event.data, TO_PAGE);
    if (isToPage(message)) handle(message);
  });
  win.addEventListener("gable:devtools-ready", attach);
  attach();
}
