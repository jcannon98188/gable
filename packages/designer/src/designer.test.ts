import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANNEL, PROTOCOL_VERSION, SESSION_NAME_PREFIX, SESSION_PARAM, envelope, isOurs, parseSession, takeSession, windowNameStorage, withSession } from "./protocol.js";
import { BUILTIN_PRESETS, MAX_FRAMES, MAX_SIZE, MIN_SIZE, NO_EMULATION, breakpointOf, clampDpr, fitScale, frameFrom, sanitizeSettings, sizeOf, unsupported } from "./devices.js";
import { handleDeviceApi, type DeviceApiContext } from "./server/device-api.js";
import { readSettings, writeSettings } from "./server/settings.js";
import { frameUrl } from "../shell/src/app/frames.js";
import { startBackend, findScenes } from "./server/backend.js";
import { hostModule } from "./server/vite-plugin.js";
import { literalAt, resolveNode, sourceText } from "./server/source.js";

describe("protocol", () => {
  it("isOurs checks channel and nonce, whatever the version", () => {
    expect(isOurs({ ...envelope("n1"), type: "ready" }, "n1")).toBe(true);
    expect(isOurs({ ...envelope("n1"), v: 99, type: "ready" }, "n1")).toBe(true);
    expect(isOurs({ ...envelope("n1"), type: "ready" }, "other")).toBe(false);
    expect(isOurs({ channel: "x", v: PROTOCOL_VERSION, nonce: "n1", type: "ready" }, "n1")).toBe(false);
    expect(isOurs("hello", "n1")).toBe(false);
    expect(CHANNEL).toBe("gable-designer");
  });

  it("carries the session in a query parameter and takes it back out", () => {
    const url = withSession("http://localhost:4701/__gable-designer/component?scenes=%2Fa.scenes.ts", "abc", "http://127.0.0.1:4700");
    expect(parseSession(new URL(url).searchParams.get(SESSION_PARAM))).toEqual({ nonce: "abc", shellOrigin: "http://127.0.0.1:4700" });

    const replaced: string[] = [];
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
    const history = { state: null, replaceState: (_: unknown, __: string, u: string) => void replaced.push(u) } as unknown as History;
    const first = takeSession({ href: url + "#/x" } as Location, history, storage);
    expect(first).toEqual({ nonce: "abc", shellOrigin: "http://127.0.0.1:4700" });
    expect(replaced[0]).toBe("/__gable-designer/component?scenes=%2Fa.scenes.ts#/x");
    // after a reload the parameter is gone; the session comes from storage
    expect(takeSession({ href: "http://localhost:4701/" } as Location, history, storage)).toEqual(first);
    // a page opened outside the Designer has neither
    expect(takeSession({ href: "http://localhost:4701/" } as Location, history, { getItem: () => null, setItem() {} } as unknown as Storage)).toBeNull();
  });
});

describe("source mapping", () => {
  const body = `\n      <ul>\n        <li class="a">one</li>\n      </ul>\n    `;
  const file = (nl: string) => `import { html } from '@gable/core';\nexport class X {\n  static meta = { template: html\`${body}\` };\n}\n`.replaceAll("\n", nl);

  it("finds the literal by content and maps a range to line and column, in LF and CRLF files", () => {
    for (const nl of ["\n", "\r\n"]) {
      const dir = mkdtempSync(join(tmpdir(), "designer-src-"));
      writeFileSync(join(dir, "x.ts"), file(nl));
      const start = body.indexOf("<li");
      const end = body.indexOf("</li>") + 5;
      const r = resolveNode(dir, { file: join(dir, "x.ts"), raw: body, start, openEnd: body.indexOf(">", start) + 1, end });
      if ("error" in r) throw new Error(r.error);
      expect(r.from).toMatchObject({ line: 5, col: 9 });
      expect(r.openingTag).toBe('<li class="a">');
      expect(r.text).toBe('<li class="a">one</li>');
    }
  });

  it("reports a literal it cannot find", () => {
    const dir = mkdtempSync(join(tmpdir(), "designer-src-"));
    writeFileSync(join(dir, "x.ts"), file("\n"));
    const r = resolveNode(dir, { file: join(dir, "x.ts"), raw: "<p>nope</p>", start: 0, openEnd: 3, end: 11 });
    expect("error" in r).toBe(true);
  });

  it("literalAt turns a file offset into a literal and an offset inside it", () => {
    const src = sourceText(file("\r\n"));
    const at = literalAt(src, src.original.indexOf("<li"));
    expect(at?.raw).toBe(body);
    expect(at?.offset).toBe(body.indexOf("<li"));
    expect(literalAt(src, 3)).toBeNull();
  });
});

describe("component-mode host module", () => {
  it("imports the scenes file, mounts the initial scene and accepts hot updates of the scenes file", () => {
    const code = hostModule("/src/a.scenes.ts", "Done");
    expect(code).toContain('import * as scenesModule from "/src/a.scenes.ts"');
    expect(code).toContain('let current = "Done"');
    expect(code).toContain('import.meta.hot.accept("/src/a.scenes.ts"');
    expect(code).toContain("__GABLE_SCENES__");
  });
});

describe("backend", () => {
  const project = () => {
    const dir = mkdtempSync(join(tmpdir(), "designer-proj-"));
    mkdirSync(join(dir, "src", "node_modules"), { recursive: true });
    writeFileSync(join(dir, "src", "x.scenes.ts"), "export default {};\n");
    writeFileSync(join(dir, "src", "node_modules", "skip.scenes.ts"), "export default {};\n");
    return dir;
  };

  it("finds scenes files and skips node_modules", () => {
    expect(findScenes(project())).toEqual(["/src/x.scenes.ts"]);
  });

  it("requires the token, and a loopback Host header", async () => {
    // The temp project has no Vite: the backend reports that as the project's error instead of crashing.
    const backend = await startBackend({ root: project() });
    try {
      expect((await fetch(`${backend.url}/api/project`)).status).toBe(401);
      expect((await fetch(`${backend.url}/api/project`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
      const ok = await fetch(`${backend.url}/api/scenes`, { headers: { authorization: `Bearer ${backend.token}` } });
      expect(await ok.json()).toEqual(["/src/x.scenes.ts"]);
      // DNS rebinding: a request that reaches us under another name is refused even with the token.
      const status = await new Promise<number>((ok) => {
        const req = httpRequest(backend.url + "/api/scenes", { headers: { authorization: `Bearer ${backend.token}`, host: "evil.example" } }, (res) => ok(res.statusCode ?? 0));
        req.end();
      });
      expect(status).toBe(403);
    } finally {
      await backend.close();
    }
  }, 20000);
});

describe("device geometry", () => {
  it("rotates a frame by swapping width and height, and keeps sizes in range", () => {
    expect(sizeOf({ width: 393, height: 852, landscape: false })).toEqual({ width: 393, height: 852 });
    expect(sizeOf({ width: 393, height: 852, landscape: true })).toEqual({ width: 852, height: 393 });
    expect(sizeOf({ width: 5, height: 99999, landscape: false })).toEqual({ width: MIN_SIZE, height: MAX_SIZE });
    expect(sizeOf({ width: Number.NaN, height: 800, landscape: false }).width).toBe(1280);
    expect(clampDpr(0)).toBe(1);
    expect(clampDpr(9)).toBe(5);
    expect(clampDpr(Number.NaN)).toBe(1);
  });

  it("fits frames side by side into the board, never scaling up", () => {
    const board = { width: 1000, height: 1000 };
    expect(fitScale([{ width: 500, height: 500 }], board, 16)).toBe(1);
    expect(fitScale([{ width: 1000, height: 500 }, { width: 1000, height: 500 }], board, 0)).toBe(0.5);
    expect(fitScale([{ width: 400, height: 2000 }], board, 0)).toBe(0.5);
    expect(fitScale([{ width: 400, height: 400 }], { width: 0, height: 0 }, 0)).toBe(1);
    expect(fitScale([{ width: 4000, height: 4000 }], { width: 100, height: 100 }, 0)).toBe(0.1);
  });

  it("names the Tailwind breakpoint a width reaches", () => {
    expect([320, 640, 767, 768, 1023, 1280, 1920].map((w) => breakpointOf(w))).toEqual(["base", "sm", "sm", "md", "md", "xl", "2xl"]);
    expect(breakpointOf(1535)).toBe("xl");
    expect(breakpointOf(500, [{ name: "tablet", min: 480 }])).toBe("tablet");
  });

  it("builds frames from presets and from nothing", () => {
    const phone = BUILTIN_PRESETS.find((p) => p.id === "iphone-15")!;
    const frame = frameFrom("a", phone);
    expect(frame).toMatchObject({ width: 393, height: 852, dpr: 3, presetId: "iphone-15", landscape: false });
    expect(frame.emulation.touch).toBe(true);
    expect(frame.emulation).not.toBe(phone.emulation);
    expect(frameFrom("b", null)).toMatchObject({ name: "Custom", presetId: null, emulation: NO_EMULATION });
  });

  it("labels what a platform cannot emulate", () => {
    expect(unsupported({ cdp: true, platform: "win32" }).map((u) => u.part)).toEqual(["dpr-media"]);
    expect(unsupported({ cdp: false, platform: "darwin" }).map((u) => u.part)).toEqual(["dpr-media", "pointer-media", "color-scheme", "reduced-motion", "user-agent"]);
  });

  it("drops what is malformed in a settings file", () => {
    expect(sanitizeSettings(null)).toEqual({ presets: [], frames: null, sync: false });
    const clean = sanitizeSettings({
      sync: true,
      presets: [{ id: "p", name: "  Mine ", width: 1, height: 100000, dpr: 99, emulation: { touch: true, colorScheme: "sepia", userAgent: 7 } }],
      frames: Array.from({ length: 10 }, (_, i) => ({ id: "f" + i })),
    });
    expect(clean.sync).toBe(true);
    expect(clean.presets[0]).toMatchObject({ name: "Mine", width: MIN_SIZE, height: MAX_SIZE, dpr: 5, emulation: { touch: true, colorScheme: "auto", userAgent: null } });
    expect(clean.frames).toHaveLength(MAX_FRAMES);
  });
});

describe("the frame's session in window.name", () => {
  it("keeps the session per frame, and leaves a window.name that is not ours alone", () => {
    const win = { name: "" } as Window;
    const storage = windowNameStorage(win);
    expect(storage.getItem("anything")).toBeNull();
    storage.setItem("anything", "abc|http://127.0.0.1:4700");
    expect(win.name).toBe(SESSION_NAME_PREFIX + "abc|http://127.0.0.1:4700");
    expect(storage.getItem("anything")).toBe("abc|http://127.0.0.1:4700");
    expect(windowNameStorage({ name: "my-popup" } as Window).getItem("x")).toBeNull();
  });
});

describe("a frame's url", () => {
  it("gives each frame its own site on the loopback, and leaves other hosts alone", () => {
    expect(frameUrl("http://localhost:5173/a?b=1", 0)).toBe("http://localhost:5173/a?b=1");
    expect(frameUrl("http://localhost:5173/a?b=1", 2)).toBe("http://f2.localhost:5173/a?b=1");
    expect(frameUrl("http://127.0.0.1:5173/", 2)).toBe("http://127.0.0.1:5173/");
  });
});

describe("device settings and api", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "designer-settings-"));

  it("keeps settings per project in the data directory", () => {
    const data = dir();
    expect(readSettings("/p/one", data).presets).toEqual([]);
    writeSettings("/p/one", { presets: [{ id: "x", name: "Phone", width: 390, height: 844, dpr: 3, emulation: { touch: true } }], sync: true }, data);
    expect(readSettings("/p/one", data).presets[0]?.name).toBe("Phone");
    expect(readSettings("/p/one", data).sync).toBe(true);
    expect(readSettings("/p/two", data).presets).toEqual([]);
  });

  function call(ctx: Partial<DeviceApiContext>, path: string, method = "POST", body: unknown = {}) {
    const sent: Array<{ status: number; body: any }> = [];
    const full: DeviceApiContext = {
      root: "/p/one",
      previewUrl: "http://localhost:5191/",
      cdp: null,
      dataDir: dir(),
      json: (_res, status, b) => void sent.push({ status, body: b }),
      readBody: async () => JSON.stringify(body),
      ...ctx,
    };
    return handleDeviceApi(full, { method } as IncomingMessage, {} as ServerResponse, new URL(path, "http://127.0.0.1:1/")).then((handled) => ({ handled, sent }));
  }

  it("ignores other paths and reports no CDP when there is none", async () => {
    expect((await call({}, "/api/other")).handled).toBe(false);
    expect((await call({}, "/api/devices/capabilities", "GET")).sent[0]?.body.cdp).toBe(false);
    const r = await call({}, "/api/devices/emulation", "POST", { nonce: "n", emulation: NO_EMULATION });
    expect(r.sent[0]?.body).toMatchObject({ ok: false });
  });

  it("hands only validated emulation to CDP", async () => {
    const seen: unknown[] = [];
    const cdp = { available: async () => true, apply: async (nonce: string, e: unknown) => (seen.push([nonce, e]), ["touch"]) } as never;
    const r = await call({ cdp }, "/api/devices/emulation", "POST", { nonce: "n1", emulation: { touch: true, colorScheme: "x", reducedMotion: true, userAgent: "UA", extra: 1 } });
    expect(r.sent[0]?.body).toEqual({ ok: true, applied: ["touch"] });
    expect(seen).toEqual([["n1", { touch: true, colorScheme: "auto", reducedMotion: true, userAgent: "UA" }]]);
    expect((await call({ cdp }, "/api/devices/emulation", "POST", { emulation: NO_EMULATION })).sent[0]?.status).toBe(400);
    const failing = { available: async () => true, apply: async () => Promise.reject(new Error("No preview frame")) } as never;
    expect((await call({ cdp: failing }, "/api/devices/emulation", "POST", { nonce: "n", emulation: NO_EMULATION })).sent[0]?.body).toMatchObject({ ok: false, error: "No preview frame" });
  });

  it("opens only the project's dev server in the system browser", async () => {
    const opened: string[] = [];
    const openExternal = (u: string) => void opened.push(u);
    const ok = await call({ openExternal }, "/api/devices/open-external", "POST", { path: "/a?x=1&y=2" });
    expect(ok.sent[0]).toEqual({ status: 200, body: { ok: true, url: "http://localhost:5191/a?x=1&y=2" } });
    for (const path of ["http://evil.example/", "//evil.example/x", "https://localhost:5191/"]) {
      expect((await call({ openExternal }, "/api/devices/open-external", "POST", { path })).sent[0]?.status).toBe(400);
    }
    expect(opened).toEqual(["http://localhost:5191/a?x=1&y=2"]);
  });

  it("round-trips settings over the api", async () => {
    const data = dir();
    await call({ dataDir: data }, "/api/devices/settings", "POST", { sync: true, presets: [] });
    const r = await call({ dataDir: data }, "/api/devices/settings", "GET");
    expect(r.sent[0]?.body.sync).toBe(true);
    const file = readdirSync(join(data, "projects"))[0]!;
    expect(JSON.parse(readFileSync(join(data, "projects", file), "utf8")).root).toBe("/p/one");
  });
});
