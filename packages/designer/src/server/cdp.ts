// Device emulation over the Chrome DevTools Protocol. The backend (Node) is the CDP client, so the Rust host only has to
// turn the debugging port on. The previewed app is a cross-site iframe of the shell, which Chromium runs out of process:
// it is its own CDP target (type `iframe`), and that is where the emulation is applied. Frames are told apart by the
// session nonce the agent keeps in the frame's `window.name` (see `windowNameStorage` in protocol.ts), so no extra
// identification has to be added to the page. `Emulation.setDeviceMetricsOverride` and `setEmitTouchEventsForMouse` only
// work on top-level targets, so size is CSS (the shell sizes the iframe) and touch events are synthesised by the agent.
import type { Emulation } from "../devices.js";
import { SESSION_NAME_PREFIX } from "../protocol.js";

interface Pending {
  ok: (result: unknown) => void;
  fail: (error: Error) => void;
}
interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
}


export class CdpEmulator {
  readonly port: number;
  #socket: WebSocket | null = null;
  #opening: Promise<WebSocket> | null = null;
  #next = 1;
  #pending = new Map<number, Pending>();
  /** targetId to the flat session attached to it. */
  #sessions = new Map<string, string>();

  constructor(port: number) {
    this.port = port;
  }

  /** True when the debugging endpoint answers. */
  async available(): Promise<boolean> {
    try {
      return (await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(1500) })).ok;
    } catch {
      return false;
    }
  }

  async #connect(): Promise<WebSocket> {
    if (this.#socket && this.#socket.readyState === WebSocket.OPEN) return this.#socket;
    return (this.#opening ??= (async () => {
      try {
        const version = (await (await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(3000) })).json()) as { webSocketDebuggerUrl: string };
        const socket = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise<void>((ok, fail) => {
          socket.onopen = () => ok();
          socket.onerror = () => fail(new Error("Could not open the DevTools socket."));
        });
        socket.onmessage = (m) => {
          const d = JSON.parse(String(m.data)) as { id?: number; result?: unknown; error?: { message: string } };
          if (d.id === undefined) return;
          const waiting = this.#pending.get(d.id);
          this.#pending.delete(d.id);
          if (d.error) waiting?.fail(new Error(d.error.message));
          else waiting?.ok(d.result);
        };
        socket.onclose = () => {
          this.#socket = null;
          this.#sessions.clear();
          for (const { fail } of this.#pending.values()) fail(new Error("The DevTools socket closed."));
          this.#pending.clear();
        };
        this.#socket = socket;
        return socket;
      } finally {
        this.#opening = null;
      }
    })());
  }

  async #send<T = unknown>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const socket = await this.#connect();
    return new Promise<T>((ok, fail) => {
      const id = this.#next++;
      this.#pending.set(id, { ok: ok as (r: unknown) => void, fail });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => this.#pending.delete(id) && fail(new Error(`${method} timed out`)), 5000).unref();
    });
  }

  /** The session of the frame bound to `nonce`, attaching to the iframe targets to read their session. */
  async #sessionFor(nonce: string): Promise<string | null> {
    const { targetInfos } = await this.#send<{ targetInfos: TargetInfo[] }>("Target.getTargets");
    const live = new Set(targetInfos.map((t) => t.targetId));
    for (const id of this.#sessions.keys()) if (!live.has(id)) this.#sessions.delete(id);
    for (const target of targetInfos.filter((t) => t.type === "iframe" || t.type === "page")) {
      let sessionId = this.#sessions.get(target.targetId);
      if (!sessionId) {
        sessionId = (await this.#send<{ sessionId: string }>("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
        this.#sessions.set(target.targetId, sessionId);
      }
      const stored = await this.#send<{ result?: { value?: string } }>("Runtime.evaluate", { expression: "window.name", returnByValue: true }, sessionId).catch(() => null);
      const value = stored?.result?.value;
      if (typeof value === "string" && value.startsWith(SESSION_NAME_PREFIX) && value.slice(SESSION_NAME_PREFIX.length).split("|")[0] === nonce) return sessionId;
    }
    return null;
  }

  /** Applies `emulation` to the frame bound to `nonce`; returns the parts that were applied. */
  async apply(nonce: string, emulation: Emulation): Promise<string[]> {
    const sessionId = await this.#sessionFor(nonce);
    if (!sessionId) throw new Error("No preview frame with that session was found over CDP.");
    const send = (method: string, params: object) => this.#send(method, params, sessionId);
    await send("Emulation.setTouchEmulationEnabled", { enabled: emulation.touch, maxTouchPoints: 5 });
    // An empty value removes an override, so `auto` and `false` restore the browser's own.
    await send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: emulation.colorScheme === "auto" ? "" : emulation.colorScheme },
        { name: "prefers-reduced-motion", value: emulation.reducedMotion ? "reduce" : "" },
      ],
    });
    await send("Emulation.setUserAgentOverride", { userAgent: emulation.userAgent ?? "", platform: platformOf(emulation.userAgent) });
    return ["touch", "pointer-media", "color-scheme", "reduced-motion", "user-agent"];
  }

  close(): void {
    this.#socket?.close();
  }
}

function platformOf(ua: string | null): string {
  if (!ua) return "";
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Linux armv81";
  return "";
}
