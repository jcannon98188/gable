// In-memory clients for the in-memory worker scope: pages and workers a test connects, which record what the
// service worker posts to them.
import type { WorkerClient, WorkerClientQueryOptions, WorkerClients } from "../core/index.js";

/** Options for {@link InMemoryClients.connect}. */
export interface ConnectClientOptions {
  /** What kind of client this is. Defaults to `"window"`. */
  type?: WorkerClient["type"];
  /** Whether the worker controls it. Defaults to whether the worker is activated when the client connects. */
  controlled?: boolean;
  /** Called with each message the worker posts to the client, after it is recorded, as the page would receive it. */
  onMessage?: (message: unknown) => void;
}

/** How {@link InMemoryClients.openWindow} behaves. */
export interface WindowOptions {
  /** The origin relative URLs resolve against; windows on other origins are not visible to the worker. */
  readonly origin: string;
  /** Whether opening a window is allowed now. */
  readonly allowed: () => boolean;
}

/** A connected client. */
export class InMemoryClient implements WorkerClient {
  readonly id: string;
  readonly url: string;
  readonly type: WorkerClient["type"];
  /** Whether the worker controls this client: its requests go through the worker. */
  controlled: boolean;
  /** Copies of the messages the worker posted to this client, oldest first. */
  readonly messages: unknown[] = [];
  readonly #close: (client: InMemoryClient) => void;
  readonly #onMessage: ((message: unknown) => void) | undefined;

  constructor(
    id: string,
    url: string,
    type: WorkerClient["type"],
    controlled: boolean,
    close: (client: InMemoryClient) => void,
    onMessage?: (message: unknown) => void,
  ) {
    this.id = id;
    this.url = url;
    this.type = type;
    this.controlled = controlled;
    this.#close = close;
    this.#onMessage = onMessage;
  }

  postMessage(message: unknown): void {
    const copy = structuredClone(message);
    this.messages.push(copy);
    this.#onMessage?.(copy);
  }

  /** Closes the client, as closing its tab would. */
  close(): void {
    this.#close(this);
  }
}

/** The clients of an in-memory scope. */
export class InMemoryClients implements WorkerClients {
  readonly #clients = new Map<string, InMemoryClient>();
  readonly #isActive: () => boolean;
  readonly #isActivated: () => boolean;
  readonly #window: WindowOptions | undefined;
  #nextId = 1;
  /** The URLs of the windows the worker opened with {@link openWindow}, oldest first, other origins included. */
  readonly openedWindows: string[] = [];

  /**
   * @param isActive whether the worker may claim clients (activating or activated)
   * @param isActivated whether new clients are controlled by default
   * @param window how openWindow resolves URLs and when it is allowed; without it openWindow always rejects
   */
  constructor(isActive: () => boolean, isActivated: () => boolean, window?: WindowOptions) {
    this.#isActive = isActive;
    this.#isActivated = isActivated;
    this.#window = window;
  }

  /** Connects a client at the absolute `url`. */
  connect(url: string, options: ConnectClientOptions = {}): InMemoryClient {
    const id = `client-${this.#nextId++}`;
    const client = new InMemoryClient(id, url, options.type ?? "window", options.controlled ?? this.#isActivated(), (c) =>
      this.#clients.delete(c.id),
      options.onMessage,
    );
    this.#clients.set(id, client);
    return client;
  }

  async get(id: string): Promise<InMemoryClient | undefined> {
    return this.#clients.get(id);
  }

  async matchAll(options: WorkerClientQueryOptions = {}): Promise<readonly InMemoryClient[]> {
    const type = options.type ?? "window";
    return [...this.#clients.values()].filter(
      (client) => (options.includeUncontrolled || client.controlled) && (type === "all" || client.type === type),
    );
  }

  /**
   * Opens a window at `url`, resolved against the origin, and connects it as a window client. As in the browser it is
   * allowed only while the worker handles a notification click, and a window on another origin resolves with `null`.
   */
  async openWindow(url: string | URL): Promise<InMemoryClient | null> {
    if (!this.#window?.allowed()) {
      throw new DOMException("openWindow is only allowed while handling a notification click", "InvalidAccessError");
    }
    const href = new URL(String(url), this.#window.origin).href;
    this.openedWindows.push(href);
    if (new URL(href).origin !== this.#window.origin) return null;
    return this.connect(href);
  }

  async claim(): Promise<void> {
    if (!this.#isActive()) throw new DOMException("only an active worker can claim clients", "InvalidStateError");
    for (const client of this.#clients.values()) client.controlled = true;
  }
}
