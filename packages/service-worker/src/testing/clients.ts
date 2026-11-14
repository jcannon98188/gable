// In-memory clients for the in-memory worker scope: pages and workers a test connects, which record what the
// service worker posts to them.
import type { WorkerClient, WorkerClientQueryOptions, WorkerClients } from "../core/index.js";

/** Options for {@link InMemoryClients.connect}. */
export interface ConnectClientOptions {
  /** What kind of client this is. Defaults to `"window"`. */
  type?: WorkerClient["type"];
  /** Whether the worker controls it. Defaults to whether the worker is activated when the client connects. */
  controlled?: boolean;
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

  constructor(id: string, url: string, type: WorkerClient["type"], controlled: boolean, close: (client: InMemoryClient) => void) {
    this.id = id;
    this.url = url;
    this.type = type;
    this.controlled = controlled;
    this.#close = close;
  }

  postMessage(message: unknown): void {
    this.messages.push(structuredClone(message));
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
  #nextId = 1;

  /**
   * @param isActive whether the worker may claim clients (activating or activated)
   * @param isActivated whether new clients are controlled by default
   */
  constructor(isActive: () => boolean, isActivated: () => boolean) {
    this.#isActive = isActive;
    this.#isActivated = isActivated;
  }

  /** Connects a client at the absolute `url`. */
  connect(url: string, options: ConnectClientOptions = {}): InMemoryClient {
    const id = `client-${this.#nextId++}`;
    const client = new InMemoryClient(id, url, options.type ?? "window", options.controlled ?? this.#isActivated(), (c) =>
      this.#clients.delete(c.id),
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

  async claim(): Promise<void> {
    if (!this.#isActive()) throw new DOMException("only an active worker can claim clients", "InvalidStateError");
    for (const client of this.#clients.values()) client.controlled = true;
  }
}
