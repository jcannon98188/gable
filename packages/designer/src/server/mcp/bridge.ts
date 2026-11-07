// The backend's end of the command channel to the shell (see `control-protocol.ts`). A shell opens
// `/api/shell/channel` (an SSE stream) and answers each `command` event with a POST to `/api/shell/reply`. Only the
// newest open channel gets commands: one window is driven, so the agent and the human look at the same state.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ControlCommands, ControlName, ControlReply, ControlRequest } from "../../control-protocol.js";

/** Where a command is delivered: an SSE stream, or a function (tests drive a fake shell through it). */
export type ShellSink = (request: ControlRequest) => void;

export class NoShellError extends Error {
  constructor(shellUrl: string | null) {
    super(
      `No Designer window is connected, so UI state (mode, frames, selection, route) cannot be read or changed. ` +
        (shellUrl ? `Open ${shellUrl} in a browser (or start the desktop app) and try again.` : "Start the desktop app or open the backend URL in a browser."),
    );
  }
}

export class ShellBridge {
  #sinks: ShellSink[] = [];
  #streams = new Set<ServerResponse>();
  #next = 1;
  #pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void; timer: NodeJS.Timeout }>();
  /** The URL a human opens to get a shell (browser mode), for error messages. */
  shellUrl: string | null = null;

  /** Adds a shell; returns its removal. The newest one receives commands. */
  connect(sink: ShellSink): () => void {
    this.#sinks.push(sink);
    return () => {
      this.#sinks = this.#sinks.filter((s) => s !== sink);
    };
  }

  get connected(): boolean {
    return this.#sinks.length > 0;
  }

  call<N extends ControlName>(name: N, params: ControlCommands[N]["params"], timeoutMs = 20000): Promise<ControlCommands[N]["result"]> {
    const sink = this.#sinks[this.#sinks.length - 1];
    if (!sink) return Promise.reject(new NoShellError(this.shellUrl));
    return new Promise((ok, fail) => {
      const id = this.#next++;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        fail(new Error(`The Designer window did not answer "${name}" within ${Math.round(timeoutMs / 1000)}s.`));
      }, timeoutMs);
      timer.unref?.();
      this.#pending.set(id, { ok: ok as (v: unknown) => void, fail, timer });
      try {
        sink({ id, name, params });
      } catch (e) {
        clearTimeout(timer);
        this.#pending.delete(id);
        fail(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  reply(message: ControlReply): boolean {
    const waiting = this.#pending.get(message.id);
    if (!waiting) return false;
    this.#pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.ok) waiting.ok(message.result);
    else waiting.fail(new Error(message.error));
    return true;
  }

  /** Serves the SSE stream of one shell (the request is already token-checked). */
  attach(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": ok\n\n");
    this.#streams.add(res);
    const remove = this.connect((r) => void res.write(`event: command\ndata: ${JSON.stringify(r)}\n\n`));
    // Proxies and some webviews drop idle streams; a comment every 20s keeps it open.
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    ping.unref?.();
    req.on("close", () => {
      clearInterval(ping);
      this.#streams.delete(res);
      remove();
    });
  }

  close(): void {
    for (const [id, { fail, timer }] of this.#pending) {
      clearTimeout(timer);
      fail(new Error("The Designer backend is shutting down."));
      this.#pending.delete(id);
    }
    this.#sinks = [];
    for (const res of this.#streams) res.end();
    this.#streams.clear();
  }
}

/** Handles `/api/shell/*` (token and Host already checked); false for any other path. */
export async function handleShellApi(bridge: ShellBridge, req: IncomingMessage, res: ServerResponse, url: URL, readBody: (req: IncomingMessage) => Promise<string>, json: (res: ServerResponse, status: number, body: unknown) => void): Promise<boolean> {
  if (url.pathname === "/api/shell/channel") {
    bridge.attach(req, res);
    return true;
  }
  if (url.pathname === "/api/shell/reply") {
    if (req.method !== "POST") return json(res, 405, { error: "POST only" }), true;
    let body: ControlReply;
    try {
      body = JSON.parse(await readBody(req)) as ControlReply;
    } catch {
      return json(res, 400, { error: "bad JSON" }), true;
    }
    json(res, 200, { ok: bridge.reply(body) });
    return true;
  }
  return false;
}
