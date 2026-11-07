// Screenshots of a frame for agents. Two ways, best first:
//
// 1. CDP (the desktop app on Windows, or any shell opened in a Chromium with a debugging port): the live frame, exactly as
//    the human sees it. The frame is its own out-of-process `iframe` target, found by the session nonce in `window.name`
//    (as `cdp.ts` does); it is captured directly, or, where Chromium refuses to capture a subframe target, the shell's page
//    is captured clipped to the frame's iframe and scaled back to the frame's own size.
// 2. A fresh render: a headless system Chromium/Edge (`GABLE_CHROME`, else the usual install paths) loads the frame's URL
//    (route and Scenario included) at the frame's size, pixel ratio and emulation. It is a new instance of the app, so
//    state the live frame holds (typed input, toggled signals) is not in it; the result says so.
//
// Without either, the tool fails with a message that says what to install or set.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { SESSION_NAME_PREFIX } from "../../protocol.js";
import type { FrameRect } from "../../control-protocol.js";

/** A minimal flat-session CDP client over the browser endpoint. */
export class CdpClient {
  #socket: WebSocket;
  #next = 1;
  #pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  #listeners = new Set<(method: string, params: unknown, sessionId?: string) => void>();

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.onmessage = (m) => {
      const d = JSON.parse(String(m.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: unknown; sessionId?: string };
      if (d.id === undefined) {
        if (d.method) for (const l of this.#listeners) l(d.method, d.params, d.sessionId);
        return;
      }
      const waiting = this.#pending.get(d.id);
      this.#pending.delete(d.id);
      if (d.error) waiting?.fail(new Error(d.error.message));
      else waiting?.ok(d.result);
    };
    socket.onclose = () => {
      for (const { fail } of this.#pending.values()) fail(new Error("The DevTools socket closed."));
      this.#pending.clear();
    };
  }

  static async connect(port: number, wsPath?: string): Promise<CdpClient> {
    const url =
      wsPath !== undefined
        ? `ws://127.0.0.1:${port}${wsPath}`
        : ((await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) })).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    const socket = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      socket.onopen = () => ok();
      socket.onerror = () => fail(new Error("Could not open the DevTools socket."));
    });
    return new CdpClient(socket);
  }

  send<T = unknown>(method: string, params: object = {}, sessionId?: string, timeoutMs = 10000): Promise<T> {
    return new Promise<T>((ok, fail) => {
      const id = this.#next++;
      this.#pending.set(id, { ok: ok as (r: unknown) => void, fail });
      this.#socket.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => this.#pending.delete(id) && fail(new Error(`${method} timed out`)), timeoutMs).unref?.();
    });
  }

  on(listener: (method: string, params: unknown, sessionId?: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    this.#socket.close();
  }
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
}

export interface Shot {
  /** Base64 PNG. */
  data: string;
  method: "cdp-frame" | "cdp-clip" | "headless";
  note: string;
}

/** Captures the live frame over the shell's CDP port. */
export async function captureLive(port: number, frame: FrameRect, shellOrigins: string[]): Promise<Shot> {
  const cdp = await CdpClient.connect(port);
  const attached: string[] = [];
  try {
    const { targetInfos } = await cdp.send<{ targetInfos: TargetInfo[] }>("Target.getTargets");
    const attach = async (t: TargetInfo) => {
      const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: t.targetId, flatten: true });
      attached.push(sessionId);
      return sessionId;
    };
    for (const t of targetInfos.filter((t) => t.type === "iframe")) {
      const sessionId = await attach(t);
      const stored = await cdp.send<{ result?: { value?: string } }>("Runtime.evaluate", { expression: "window.name", returnByValue: true }, sessionId).catch(() => null);
      const value = stored?.result?.value;
      if (typeof value !== "string" || !value.startsWith(SESSION_NAME_PREFIX) || value.slice(SESSION_NAME_PREFIX.length).split("|")[0] !== frame.nonce) continue;
      try {
        const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        return { data, method: "cdp-frame", note: "Live frame, captured over CDP." };
      } catch {
        break; // a subframe target this Chromium will not capture: clip the shell's page instead
      }
    }
    const page = targetInfos.find((t) => t.type === "page" && shellOrigins.some((o) => t.url.startsWith(o)));
    if (!page) throw new Error("The Designer window is not among the CDP targets on that port.");
    const sessionId = await attach(page);
    const { rect, scale } = frame;
    // The capture is in device pixels: on a scaled display (150%) the window's own pixel ratio would enlarge it again.
    const shellDpr = await cdp
      .send<{ result?: { value?: unknown } }>("Runtime.evaluate", { expression: "devicePixelRatio", returnByValue: true }, sessionId)
      .then((r) => (typeof r.result?.value === "number" && r.result.value > 0 ? r.result.value : 1))
      .catch(() => 1);
    const { data } = await cdp.send<{ data: string }>(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: true, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 / ((scale > 0 ? scale : 1) * shellDpr) } },
      sessionId,
    );
    return { data, method: "cdp-clip", note: `Live frame, clipped from the Designer window over CDP${scale !== 1 ? ` and scaled from ${Math.round(scale * 100)}% back to 100%` : ""}.` };
  } finally {
    for (const s of attached) await cdp.send("Target.detachFromTarget", { sessionId: s }).catch(() => undefined);
    cdp.close();
  }
}

/** A Chromium-family browser on this machine: `GABLE_CHROME`, else the usual places. */
export function findBrowser(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): string | null {
  if (env.GABLE_CHROME) return existsSync(env.GABLE_CHROME) ? env.GABLE_CHROME : null;
  const candidates: string[] = [];
  if (platform === "win32") {
    for (const base of [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter((b): b is string => !!b)) {
      candidates.push(join(base, "Microsoft", "Edge", "Application", "msedge.exe"), join(base, "Google", "Chrome", "Application", "chrome.exe"));
    }
  } else if (platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium");
  } else {
    for (const dir of (env.PATH ?? "").split(delimiter)) for (const name of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) candidates.push(join(dir, name));
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Renders the frame's URL in a headless browser at the frame's size and emulation. */
export async function captureHeadless(browser: string, frame: FrameRect, settleMs = 800): Promise<Shot> {
  const profile = mkdtempSync(join(tmpdir(), "gable-designer-shot-"));
  let child: ChildProcess | null = null;
  let cdp: CdpClient | null = null;
  try {
    child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
    const failed = new Promise<never>((_, fail) => child!.once("error", (e) => fail(new Error(`Could not start ${browser}: ${e.message}`))));
    const portFile = join(profile, "DevToolsActivePort");
    const ready = (async () => {
      for (let i = 0; i < 100; i++) {
        if (existsSync(portFile)) {
          const [port, path] = readFileSync(portFile, "utf8").split(/\r?\n/);
          if (port && path) return { port: Number(port), path };
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("The headless browser did not open its debugging port.");
    })();
    const { port, path } = await Promise.race([ready, failed]);
    cdp = await CdpClient.connect(port, path);
    const { targetInfos } = await cdp.send<{ targetInfos: TargetInfo[] }>("Target.getTargets");
    const page = targetInfos.find((t) => t.type === "page");
    if (!page) throw new Error("The headless browser has no page.");
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: page.targetId, flatten: true });
    const send = (method: string, params: object = {}) => cdp!.send(method, params, sessionId);
    const e = frame.emulation;
    await send("Emulation.setDeviceMetricsOverride", { width: frame.width, height: frame.height, deviceScaleFactor: frame.dpr, mobile: e.touch });
    await send("Emulation.setTouchEmulationEnabled", { enabled: e.touch, maxTouchPoints: 5 });
    await send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: e.colorScheme === "auto" ? "" : e.colorScheme },
        { name: "prefers-reduced-motion", value: e.reducedMotion ? "reduce" : "" },
      ],
    });
    if (e.userAgent) await send("Emulation.setUserAgentOverride", { userAgent: e.userAgent });
    await send("Page.enable");
    const loaded = new Promise<void>((ok) => {
      const off = cdp!.on((method, _p, sid) => {
        if (method === "Page.loadEventFired" && sid === sessionId) (off(), ok());
      });
      setTimeout(ok, 15000).unref?.();
    });
    await send("Page.navigate", { url: frame.url });
    await loaded;
    await new Promise((r) => setTimeout(r, settleMs));
    const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId, 15000);
    return { data, method: "headless", note: `Fresh render of ${frame.url} in a headless browser at ${frame.width}x${frame.height}@${frame.dpr}x (not the live frame: state held only in the open window is not shown).` };
  } finally {
    cdp?.close();
    child?.kill();
    // The profile can stay locked for a moment after the browser exits (Windows).
    setTimeout(() => {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // left in the temp directory
      }
    }, 1500).unref?.();
  }
}
