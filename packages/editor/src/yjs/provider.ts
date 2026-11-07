import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";

/** What the editor needs from any Yjs transport: the doc, awareness, and a signal that the first sync finished. */
export interface CollabProvider {
  readonly ydoc: Y.Doc;
  readonly awareness: Awareness;
  /** Resolves once the document has synced with the server or peers (immediately for offline use). */
  readonly synced: Promise<void>;
  destroy(): void;
}

/** The common shape of y-websocket, Hocuspocus and similar providers. */
export interface YjsProviderLike {
  doc?: Y.Doc;
  awareness: Awareness;
  synced?: boolean;
  on(event: string, cb: (...args: any[]) => void): void;
  off?(event: string, cb: (...args: any[]) => void): void;
  destroy?(): void;
}

/** Wraps an existing provider (y-websocket's WebsocketProvider, HocuspocusProvider, ...) as a CollabProvider. */
export function adaptProvider(provider: YjsProviderLike, ydoc: Y.Doc = provider.doc as Y.Doc): CollabProvider {
  if (!ydoc) throw new Error("adaptProvider: pass the Y.Doc when the provider does not expose `doc`.");
  const synced = new Promise<void>((resolve) => {
    if (provider.synced) return resolve();
    const done = (isSynced?: unknown) => {
      // y-websocket emits `sync` with a boolean; Hocuspocus emits `synced`.
      if (isSynced === false) return;
      provider.off?.("sync", done);
      provider.off?.("synced", done);
      resolve();
    };
    provider.on("sync", done);
    provider.on("synced", done);
  });
  return { ydoc, awareness: provider.awareness, synced, destroy: () => provider.destroy?.() };
}

/** Offline: no transport, synced right away. Awareness still works locally. */
export function createLocalProvider(ydoc: Y.Doc = new Y.Doc()): CollabProvider {
  return { ydoc, awareness: new Awareness(ydoc), synced: Promise.resolve(), destroy() {} };
}

export interface LinkedPeers {
  peers: CollabProvider[];
  /** Cut the link (peers keep working offline); call `reconnect` to exchange everything missed. */
  disconnect(): void;
  reconnect(): void;
  destroy(): void;
}

/**
 * Connects Y.Docs and awareness instances in memory. Meant for tests, demos and same-page collaboration; it speaks the
 * same update formats a network provider would, so editors cannot tell the difference.
 */
export function linkPeers(count = 2): LinkedPeers {
  const peers = Array.from({ length: count }, () => createLocalProvider());
  let online = true;
  const REMOTE = Symbol("linked-peer");
  const offs: Array<() => void> = [];
  peers.forEach((from, i) => {
    const onDoc = (update: Uint8Array, origin: unknown) => {
      if (!online || origin === REMOTE) return;
      peers.forEach((to, j) => i !== j && Y.applyUpdate(to.ydoc, update, REMOTE));
    };
    from.ydoc.on("update", onDoc);
    const onAware = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (!online || origin === REMOTE) return;
      const changed = [...added, ...updated, ...removed];
      const update = encodeAwarenessUpdate(from.awareness, changed);
      peers.forEach((to, j) => i !== j && applyAwarenessUpdate(to.awareness, update, REMOTE));
    };
    from.awareness.on("update", onAware);
    offs.push(() => {
      from.ydoc.off("update", onDoc);
      from.awareness.off("update", onAware);
    });
  });
  const exchange = () => {
    peers.forEach((a) =>
      peers.forEach((b) => {
        if (a === b) return;
        Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc), REMOTE);
        applyAwarenessUpdate(b.awareness, encodeAwarenessUpdate(a.awareness, [a.awareness.clientID]), REMOTE);
      }),
    );
  };
  return {
    peers,
    disconnect: () => void (online = false),
    reconnect: () => {
      online = true;
      exchange();
    },
    destroy: () => {
      offs.forEach((f) => f());
      peers.forEach((p) => p.awareness.destroy());
    },
  };
}
