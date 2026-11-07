// Recorded mocks and network conditions (TASK-56.20): the scenes-file writer (minimal patches through the EditService, undone
// by the reverse patch), the literal reader, and the shared condition and recording helpers.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EditService } from "./server/edit/service.js";
import { readMocks } from "./server/edit/mocks.js";
import { readSceneFile } from "./server/scene-index.js";
import type { EditOp, EditResult } from "./server/edit/types.js";
import { NetworkCapture, initiatorOf } from "./agent/network.js";
import { conditionApplies, conditionLabel, mocksFromRecording, sanitizeCondition, type RecordedResponse } from "./network.js";

const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r;
};

const SCENES = `import type { ComponentScenes } from '@gable/core/tooling';
import { App } from './app.js';

export default {
  component: App,
  scenes: {
    Empty: { http: [{ method: 'GET', url: '/api/users', reply: { status: 200, body: [] } }] },
    Failing: {
      http: [
        { url: '/api/users', reply: { status: 500, delay: 300 } },
        { url: /\\/api\\/u\\d+/, reply: () => ({ status: 200 }) },
      ],
    },
  },
} satisfies ComponentScenes<App>;
`;

function project(text: string, eol = "\n") {
  const root = mkdtempSync(join(tmpdir(), "gable-mocks-"));
  mkdirSync(join(root, "src"));
  const file = join(root, "src", "app.scenes.ts");
  writeFileSync(file, text.replaceAll("\n", eol));
  const svc = new EditService(root);
  const read = () => readFileSync(file, "utf8");
  type MockOp = Extract<EditOp, { op: "addMockScene" | "setMock" | "removeMock" }>;
  const apply = (op: MockOp extends infer O ? (O extends MockOp ? Omit<O, "file"> : never) : never) => svc.apply({ ...op, file: "/src/app.scenes.ts" } as EditOp);
  return { svc, read, apply, text: () => read().replaceAll("\r\n", "\n") };
}

const USERS = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
  { id: 2, name: "Alan Turing", email: "alan@example.com" },
];

describe("recorded mocks become a Scenario", () => {
  it("adds a scene with the recorded responses as one insertion, readable by the scene index; undo restores byte for byte", () => {
    const p = project(SCENES);
    const r = ok(p.apply({ op: "addMockScene", name: "Recorded", description: "As the dev API answered", url: "/users", mocks: [{ method: "GET", url: "/api/users", status: 200, body: USERS }, { method: "GET", url: "/api/health", status: 204, body: null }] }));
    expect(r.label).toBe('Add Scenario "Recorded" (2 recorded responses)');
    const text = p.text();
    expect(text).toContain(`    Recorded: {
      description: 'As the dev API answered',
      url: '/users',
      http: [
        { method: 'GET', url: '/api/users', reply: { status: 200, body: [
          {
            "id": 1,`);
    expect(text).toContain(`        { method: 'GET', url: '/api/health', reply: { status: 204, body: null } },
      ],
    },
  },
} satisfies`);
    const entry = readSceneFile("/src/app.scenes.ts", text).scenes.find((s) => s.name === "Recorded")!;
    expect(entry).toEqual({ name: "Recorded", description: "As the dev API answered", mocks: 2, url: "/users" });
    // What was written reads back as the same data.
    const mocks = readMocks(text);
    if ("ok" in mocks) throw new Error(mocks.error);
    const recorded = mocks.find((s) => s.scene === "Recorded")!;
    expect(recorded.mocks[0]).toMatchObject({ method: "GET", url: "/api/users", reply: { status: 200, body: USERS, hasBody: true }, readonly: null });
    ok(p.svc.undo());
    expect(p.read()).toBe(SCENES);
  });

  it("keeps CRLF files CRLF and writes short bodies on one line", () => {
    const p = project(SCENES, "\r\n");
    ok(p.apply({ op: "addMockScene", name: "Short", mocks: [{ method: "POST", url: "/api/login", status: 201, body: { ok: true } }] }));
    const raw = p.read();
    expect(raw.split("\n").every((l, i, all) => i === all.length - 1 || l.endsWith("\r"))).toBe(true);
    expect(p.text()).toContain(`    Short: {\n      http: [\n        { method: 'POST', url: '/api/login', reply: { status: 201, body: {"ok":true} } },\n      ],\n    },\n  },`);
    ok(p.svc.undo());
    expect(p.read()).toBe(SCENES.replaceAll("\n", "\r\n"));
  });

  it("refuses an empty recording, bad methods, statuses and names, and leaves the file alone", () => {
    const p = project(SCENES);
    const refuse = (op: Parameters<typeof p.apply>[0]) => {
      const r = p.apply(op);
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.error;
    };
    const m = { method: "GET", url: "/api/x", status: 200, body: 1 };
    expect(refuse({ op: "addMockScene", name: "A", mocks: [] })).toMatch(/record/);
    expect(refuse({ op: "addMockScene", name: "A", mocks: [{ ...m, method: "get" }] })).toMatch(/method/);
    expect(refuse({ op: "addMockScene", name: "A", mocks: [{ ...m, status: 99 }] })).toMatch(/status/);
    expect(refuse({ op: "addMockScene", name: "Empty", mocks: [m] })).toMatch(/already/);
    expect(refuse({ op: "addMockScene", name: "A", url: "users", mocks: [m] })).toMatch(/path/);
    expect(p.read()).toBe(SCENES);
  });
});

describe("editing one mock", () => {
  it("reads every scene's mocks, marking computed ones read-only", () => {
    const mocks = readMocks(SCENES);
    if ("ok" in mocks) throw new Error(mocks.error);
    expect(mocks.map((s) => [s.scene, s.mocks.length])).toEqual([["Empty", 1], ["Failing", 2]]);
    expect(mocks[1]!.mocks[0]).toMatchObject({ method: null, url: "/api/users", reply: { status: 500, delay: 300, hasBody: false }, readonly: null });
    expect(mocks[1]!.mocks[1]).toMatchObject({ url: "/\\/api\\/u\\d+/", reply: null });
    expect(mocks[1]!.mocks[1]!.readonly).toMatch(/computed/);
  });

  it("replaces, adds and removes reply fields as separate small hunks, and undo restores the file", () => {
    const p = project(SCENES);
    ok(p.apply({ op: "setMock", scene: "Empty", index: 0, reply: { status: 503, delay: 1200 } }));
    expect(p.text()).toContain(`Empty: { http: [{ method: 'GET', url: '/api/users', reply: { status: 503, body: [], delay: 1200 } }] },`);
    ok(p.apply({ op: "setMock", scene: "Failing", index: 0, reply: { delay: null, error: "network" } }));
    expect(p.text()).toContain(`{ url: '/api/users', reply: { status: 500, error: 'network' } },`);
    ok(p.apply({ op: "setMock", scene: "Failing", index: 0, reply: { status: null, error: null, body: { items: [] } } }));
    expect(p.text()).toContain(`{ url: '/api/users', reply: { body: {"items":[]} } },`);
    ok(p.svc.undo());
    ok(p.svc.undo());
    ok(p.svc.undo());
    expect(p.read()).toBe(SCENES);
  });

  it("writes into multi-line replies with the file's indent and keeps trailing commas", () => {
    const multi = SCENES.replace("{ url: '/api/users', reply: { status: 500, delay: 300 } },", "{\n          url: '/api/users',\n          reply: {\n            status: 500,\n            delay: 300,\n          },\n        },");
    const p = project(multi);
    ok(p.apply({ op: "setMock", scene: "Failing", index: 0, reply: { error: "abort", delay: null } }));
    expect(p.text()).toContain(`          reply: {\n            status: 500,\n            error: 'abort',\n          },`);
    ok(p.svc.undo());
    expect(p.read()).toBe(multi);
  });

  it("removes a mock with its comma, and refuses stale or computed ones", () => {
    const p = project(SCENES);
    expect(p.apply({ op: "removeMock", scene: "Failing", index: 0, expectUrl: "/api/other" })).toMatchObject({ ok: false, code: "stale" });
    expect(p.apply({ op: "setMock", scene: "Failing", index: 1, reply: { status: 200 } })).toMatchObject({ ok: false, code: "readonly" });
    expect(p.apply({ op: "setMock", scene: "Nope", index: 0, reply: { status: 200 } })).toMatchObject({ ok: false, code: "stale" });
    ok(p.apply({ op: "removeMock", scene: "Failing", index: 0, expectUrl: "/api/users" }));
    expect(p.text()).toContain(`      http: [\n        { url: /\\/api\\/u\\d+/, reply: () => ({ status: 200 }) },\n      ],`);
    ok(p.apply({ op: "removeMock", scene: "Empty", index: 0 }));
    expect(p.text()).toContain(`Empty: { http: [] },`);
    ok(p.svc.undo());
    ok(p.svc.undo());
    expect(p.read()).toBe(SCENES);
  });
});

describe("network conditions and recordings (shared)", () => {
  it("sanitizes conditions from untrusted input", () => {
    expect(sanitizeCondition({ mode: "slow", delay: 99999999, match: "/api" })).toEqual({ mode: "slow", delay: 60000, status: 500, match: "/api", frame: false });
    expect(sanitizeCondition({ mode: "error", status: 200 })).toMatchObject({ mode: "error", status: 500 });
    expect(sanitizeCondition({ mode: "error", status: 503 })).toMatchObject({ status: 503 });
    expect(sanitizeCondition({ mode: "bogus", frame: true })).toMatchObject({ mode: "normal", frame: false });
    expect(sanitizeCondition({ mode: "offline", frame: true }).frame).toBe(true);
    expect(sanitizeCondition(null).mode).toBe("normal");
  });

  it("applies to matching URLs only, and says what it is", () => {
    const c = sanitizeCondition({ mode: "error", status: 503, match: "/api/users" });
    expect(conditionApplies(c, "http://localhost/api/users?page=2")).toBe(true);
    expect(conditionApplies(c, "http://localhost/api/health")).toBe(false);
    expect(conditionApplies(sanitizeCondition({}), "/x")).toBe(false);
    expect(conditionLabel(c)).toBe("Error 503 on /api/users");
    expect(conditionLabel(sanitizeCondition({ mode: "slow", delay: 800 }))).toBe("Slow (+800 ms)");
  });

  it("turns a recording into one mock per method and path, the latest answer winning", () => {
    const rec = (id: number, method: string, url: string, body: unknown, skipped?: string): RecordedResponse => ({ id, method, url, query: "", status: 200, contentType: "application/json", body, at: id, ...(skipped ? { skipped } : {}) });
    const { mocks, left } = mocksFromRecording([rec(1, "GET", "/api/users", [1]), rec(2, "POST", "/api/users", { ok: 1 }), rec(3, "GET", "/api/users", [1, 2]), rec(4, "GET", "/api/logo", null, "binary (image/png)")]);
    expect(mocks).toEqual([
      { method: "GET", url: "/api/users", status: 200, body: [1, 2] },
      { method: "POST", url: "/api/users", status: 200, body: { ok: 1 } },
    ]);
    expect(left).toEqual([{ method: "GET", url: "/api/logo", why: "binary (image/png)" }]);
  });
});

describe("the agent's network capture", () => {
  const ORIGIN = "http://localhost:5173";
  function page(storage = new Map<string, string>()) {
    const calls: string[] = [];
    const events: string[] = [];
    let changes = 0;
    const store = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) };
    const target = {
      location: { href: `${ORIGIN}/users` },
      navigator: {} as Navigator,
      dispatchEvent: (e: Event) => (events.push(e.type), true),
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.push(url);
        if (url.includes("/api/users")) return new Response(JSON.stringify(USERS), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
        if (url.includes("/logo.png")) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
    };
    const capture = new NetworkCapture({ storage: store, isDesigner: (u) => u.includes("/__gable-designer/"), changed: () => void changes++ });
    capture.install(target);
    const settle = () => new Promise((r) => setTimeout(r, 20));
    return { capture, target, calls, events, storage, settle, changes: () => changes };
  }

  it("logs the page's requests with status, size and type, and leaves the Designer's and Vite's alone", async () => {
    const p = page();
    const res = await p.target.fetch!("/api/users?page=1");
    expect(await res.json()).toEqual(USERS); // the app still reads the body
    await p.target.fetch!(`${ORIGIN}/__gable-designer/axe.js`).catch(() => undefined);
    await p.target.fetch!(`${ORIGIN}/@vite/client`).catch(() => undefined);
    await expect(p.target.fetch!("/down")).rejects.toThrow(TypeError);
    await p.settle();
    const [users, down] = p.capture.snapshot().entries;
    expect(p.capture.snapshot().entries).toHaveLength(2);
    expect(users).toMatchObject({ kind: "fetch", method: "GET", url: `${ORIGIN}/api/users?page=1`, status: 200, contentType: "application/json", size: JSON.stringify(USERS).length, error: null, conditioned: null });
    expect(users!.duration).toBeGreaterThanOrEqual(0);
    expect(down).toMatchObject({ status: 0, error: "Failed to fetch" });
    expect(p.changes()).toBeGreaterThan(0);
  });

  it("records real responses (JSON parsed, binary left out) and keeps recording across a reload", async () => {
    const p = page();
    p.capture.record({ on: true });
    await p.target.fetch!("/api/users?page=2");
    await p.target.fetch!("/logo.png");
    await p.settle();
    const recorded = p.capture.recorded();
    expect(recorded[0]).toMatchObject({ method: "GET", url: "/api/users", query: "?page=2", status: 200, contentType: "application/json", body: USERS });
    expect(recorded[1]).toMatchObject({ url: "/logo.png", body: null, skipped: "binary (image/png)" });
    // The frame reloads: a new capture on the same sessionStorage is still recording, with what it had.
    const again = page(p.storage);
    expect(again.capture.recordingInfo()).toEqual({ on: true, count: 2, persisted: true });
    await again.target.fetch!("/api/users");
    await again.settle();
    expect(again.capture.recorded().map((r) => r.url)).toEqual(["/api/users", "/logo.png", "/api/users"]);
    again.capture.record({ on: false, clear: true });
    expect(again.storage.size).toBe(0);
  });

  it("records a response whose client aborts the request once it has read it (as the core Http client does)", async () => {
    const p = page();
    const body = new TextEncoder().encode(JSON.stringify(USERS));
    p.target.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        pull: (c) => new Promise<void>((done) => setTimeout(() => (c.enqueue(body), c.close(), done()), 5)),
      });
      init?.signal?.addEventListener("abort", () => stream.cancel().catch(() => undefined));
      const res = new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
      Object.defineProperty(res, "url", { value: `${ORIGIN}/api/users` });
      return res;
    }) as typeof fetch;
    p.capture.install(p.target);
    p.capture.record({ on: true });
    const controller = new AbortController();
    const res = await p.target.fetch!("/api/users", { signal: controller.signal });
    expect(res.url).toBe(`${ORIGIN}/api/users`);
    expect(await res.json()).toEqual(USERS);
    controller.abort();
    await p.settle();
    expect(p.capture.recorded()).toMatchObject([{ url: "/api/users", status: 200, body: USERS }]);
    const users = p.capture.snapshot().entries.at(-1);
    expect(users).toMatchObject({ status: 200, size: body.byteLength, error: null });
  });

  it("answers matching requests with the error condition without a network, and fails them offline", async () => {
    const p = page();
    p.capture.setCondition({ mode: "error", status: 503, match: "/api/users" });
    const res = await p.target.fetch!("/api/users");
    expect(res.status).toBe(503);
    expect(p.calls).toEqual([]);
    p.capture.setCondition({ mode: "offline" });
    expect(p.target.navigator.onLine).toBe(false);
    expect(p.events).toEqual(["offline"]);
    await expect(p.target.fetch!("/api/users")).rejects.toThrow("Failed to fetch");
    p.capture.setCondition({ mode: "normal" });
    expect(p.events).toEqual(["offline", "online"]);
    expect(p.target.navigator.onLine).toBeUndefined(); // the override is gone (a real navigator answers again)
    await p.settle();
    expect(p.capture.snapshot().entries.map((e) => [e.status, e.conditioned])).toEqual([[503, "error 503"], [0, "offline"]]);
  });

  it("holds requests back when slow, and keeps the condition across a reload", async () => {
    const p = page();
    p.capture.setCondition({ mode: "slow", delay: 60 });
    const again = page(p.storage);
    expect(again.capture.condition).toMatchObject({ mode: "slow", delay: 60 });
    const t0 = Date.now();
    await again.target.fetch!("/api/users");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
    expect(again.capture.snapshot().entries[0]!.conditioned).toBe("slowed +60 ms");
  });

  it("logs the Scenario's mocked requests and puts the condition on their replies", async () => {
    const p = page();
    const hook = globalThis.__GABLE_DESIGNER_NET__!;
    expect(hook.reply({ method: "get", url: "/api/users", params: { q: "a" } }, { status: 200, body: USERS }, 0)).toEqual({ status: 200, body: USERS });
    p.capture.setCondition({ mode: "slow", delay: 10 });
    expect(hook.reply({ method: "GET", url: "/api/users" }, { status: 200, body: [] }, 0)).toEqual({ status: 200, body: [], delay: 10 });
    p.capture.setCondition({ mode: "offline" });
    expect(hook.reply({ method: "GET", url: "/api/users" }, { status: 200 }, 0)).toEqual({ error: "network" });
    hook.unmatched({ method: "GET", url: "/api/none", outcome: "404" });
    await p.settle();
    const entries = p.capture.snapshot().entries;
    expect(entries.map((e) => [e.kind, e.url, e.status, e.mock])).toEqual([
      ["mock", `${ORIGIN}/api/users?q=a`, 200, 0],
      ["mock", `${ORIGIN}/api/users`, 200, 0],
      ["mock", `${ORIGIN}/api/users`, 0, 0],
      ["mock", `${ORIGIN}/api/none`, 404, -1],
    ]);
    expect(entries[0]!.size).toBe(JSON.stringify(USERS).length);
  });

  it("finds the app's code in a call stack, skipping the agent, Vite and dependencies", () => {
    const stack = [
      "Error",
      `    at NetworkCapture.#initiator (${ORIGIN}/@fs/C:/gable/packages/designer/dist/agent/network.js:90:19)`,
      `    at send (${ORIGIN}/node_modules/.vite/deps/@gable_core_http.js?v=1:140:22)`,
      `    at UsersService.load (${ORIGIN}/src/users.service.ts?t=17:12:5)`,
    ].join("\n");
    expect(initiatorOf(stack, () => false)).toBe("/src/users.service.ts:12");
    expect(initiatorOf("Error\n    at <anonymous>", () => false)).toBeNull();
  });
});
