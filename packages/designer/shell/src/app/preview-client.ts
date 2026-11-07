// The shell's end of the protocol: owns one preview iframe, binds it to a session (nonce + origins), and checks every
// message that comes back (source window, origin, nonce, protocol version).
import { CHANNEL, PROTOCOL_VERSION, withSession, isOurs, type AgentMessage, type AgentMethods, type Ready, type ShellMessage } from "../../../src/protocol.js";

export type AgentEvent = Extract<AgentMessage, { type: "event" | "pick" | "badge" | "action" | "scenes" | "incompatible" | "ready" | "interaction" | "activity" }>;

export class PreviewClient {
  readonly nonce = crypto.randomUUID();
  #frame: HTMLIFrameElement | null = null;
  #origin = "";
  #next = 1;
  #pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  #onMessage: (message: AgentEvent) => void;

  constructor(onMessage: (message: AgentEvent) => void) {
    this.#onMessage = onMessage;
    addEventListener("message", (e) => this.#receive(e));
  }

  /** Points the iframe at `url`, bound to this session by a query parameter the agent consumes. */
  load(frame: HTMLIFrameElement, url: string): void {
    this.#frame = frame;
    this.#origin = new URL(url).origin;
    for (const { fail } of this.#pending.values()) fail(new Error("The preview reloaded."));
    this.#pending.clear();
        frame.onload = () => this.#post({ channel: CHANNEL, v: PROTOCOL_VERSION, nonce: this.nonce, type: "hello" });
    frame.src = withSession(url, this.nonce, location.origin);
  }

  call<M extends keyof AgentMethods>(method: M, params: AgentMethods[M]["params"]): Promise<AgentMethods[M]["result"]> {
    return new Promise((ok, fail) => {
      const id = this.#next++;
      this.#pending.set(id, { ok: ok as (v: unknown) => void, fail });
      this.#post({ channel: CHANNEL, v: PROTOCOL_VERSION, nonce: this.nonce, type: "call", id, method, params } as ShellMessage);
    });
  }

  #post(message: ShellMessage): void {
    this.#frame?.contentWindow?.postMessage(message, this.#origin);
  }

  #receive(e: MessageEvent): void {
    if (!this.#frame || e.source !== this.#frame.contentWindow || e.origin !== this.#origin || !isOurs(e.data, this.nonce)) return;
    const m = e.data as AgentMessage;
    if (m.v !== PROTOCOL_VERSION) return this.#onMessage({ ...m, type: "incompatible", agent: m.v, shell: PROTOCOL_VERSION } as AgentEvent);
    if (m.type === "response") {
      const waiting = this.#pending.get(m.id);
      this.#pending.delete(m.id);
      if (m.ok) waiting?.ok(m.result);
      else waiting?.fail(new Error(m.error));
    } else this.#onMessage(m as AgentEvent);
  }
}

export type { Ready };
