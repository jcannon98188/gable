import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANNEL, PROTOCOL_VERSION, SESSION_PARAM, envelope, isOurs, parseSession, takeSession, withSession } from "./protocol.js";
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
