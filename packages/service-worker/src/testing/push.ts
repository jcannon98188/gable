// The in-memory browser's push model: the origin's notification permission with its prompt, and the push manager of
// each registration. It follows what a browser does that apps trip over: subscribing needs an active worker, the
// permission and `userVisibleOnly: true`; an existing subscription is returned for the same key and refused for another;
// the permission prompt is answered by the test, not a user.
import type { NotificationsLike, PushManagerLike, PushSubscribeInit, PushSubscriptionLike } from "../app/container.js";

/** The notification permission: what `Notification.permission` reports. */
export type NotificationPermissionState = "default" | "granted" | "denied";

/** The origin's notification permission, and what the user answers when asked. */
export class InMemoryPermission implements NotificationsLike {
  /** The permission now. Set it to model the user changing it in the browser's settings. */
  permission: NotificationPermissionState;
  /**
   * What the user answers the permission prompt: `"granted"`, `"denied"`, or `"default"` for dismissing it without an
   * answer. The prompt appears only while the permission is `"default"`.
   */
  answer: NotificationPermissionState;
  /** How many times the user was asked. */
  prompts = 0;

  constructor(permission: NotificationPermissionState = "default", answer: NotificationPermissionState = "granted") {
    this.permission = permission;
    this.answer = answer;
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (this.permission === "default") {
      this.prompts++;
      this.permission = this.answer;
    }
    return this.permission;
  }
}

const domError = (name: string, message: string): Error => Object.assign(new Error(message), { name });

/** A push subscription held by an {@link InMemoryPushManager}. */
export class InMemoryPushSubscription implements PushSubscriptionLike {
  readonly expirationTime: number | null = null;

  constructor(
    readonly endpoint: string,
    /** The application server key it was made with, as bytes joined by commas, for comparing keys. */
    readonly keyId: string,
    private readonly cancel: (subscription: InMemoryPushSubscription) => boolean,
  ) {}

  toJSON(): { endpoint: string; expirationTime: number | null; keys: Record<string, string> } {
    const id = this.endpoint.slice(this.endpoint.lastIndexOf("/") + 1);
    return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: `p256dh-${id}`, auth: `auth-${id}` } };
  }

  async unsubscribe(): Promise<boolean> {
    return this.cancel(this);
  }
}

/** The bytes of an application server key, as a comparable string: base64url strings are decoded, as browsers do. */
function keyId(key: PushSubscribeInit["applicationServerKey"]): string {
  if (key === undefined || key === null) throw domError("InvalidAccessError", "Subscription failed - missing applicationServerKey");
  let bytes: number[];
  if (typeof key === "string") {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    bytes = [];
    let bits = 0;
    let acc = 0;
    for (const char of key.replace(/=+$/, "")) {
      const value = alphabet.indexOf(char);
      if (value < 0) throw domError("InvalidCharacterError", "The string to be decoded is not correctly encoded.");
      acc = (acc << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((acc >> bits) & 0xff);
      }
    }
  } else {
    bytes = [...(ArrayBuffer.isView(key) ? new Uint8Array(key.buffer, key.byteOffset, key.byteLength) : new Uint8Array(key))];
  }
  if (bytes.length === 0) throw domError("InvalidAccessError", "Subscription failed - missing applicationServerKey");
  return bytes.join(",");
}

/** What an {@link InMemoryPushManager} needs from its browser. */
export interface PushManagerHost {
  readonly permission: InMemoryPermission;
  /** Whether the registration has an active worker. */
  hasActiveWorker(): boolean;
  /** A new, unique push service endpoint. */
  newEndpoint(): string;
}

/** A registration's push manager. */
export class InMemoryPushManager implements PushManagerLike {
  #subscription: InMemoryPushSubscription | null = null;
  readonly #host: PushManagerHost;

  constructor(host: PushManagerHost) {
    this.#host = host;
  }

  /** The endpoint of the subscription, or `null` when there is none. */
  get endpoint(): string | null {
    return this.#subscription?.endpoint ?? null;
  }

  async subscribe(options: PushSubscribeInit = {}): Promise<InMemoryPushSubscription> {
    if (!this.#host.hasActiveWorker()) throw domError("AbortError", "Subscription failed - no active Service Worker");
    if (options.userVisibleOnly !== true) {
      throw domError("NotSupportedError", "Subscription failed - this browser only supports user-visible push messages");
    }
    const key = keyId(options.applicationServerKey);
    if (this.#subscription && this.#subscription.keyId !== key) {
      throw domError("InvalidStateError", "Subscription failed - a subscription with a different applicationServerKey exists");
    }
    if ((await this.#host.permission.requestPermission()) !== "granted") {
      throw domError("NotAllowedError", "Subscription failed - permission denied");
    }
    this.#subscription ??= new InMemoryPushSubscription(this.#host.newEndpoint(), key, (s) => this.#cancel(s));
    return this.#subscription;
  }

  async getSubscription(): Promise<InMemoryPushSubscription | null> {
    return this.#subscription;
  }

  #cancel(subscription: InMemoryPushSubscription): boolean {
    if (this.#subscription !== subscription) return false;
    this.#subscription = null;
    return true;
  }
}
