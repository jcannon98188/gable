// The HTTP endpoints behind device emulation and the multi-frame canvas. Kept out of backend.ts, which only forwards
// requests it does not recognise there (token and Host are already checked by then).
import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sanitizeSettings, sanitizeThrottle, type Capabilities, type Emulation } from "../devices.js";
import type { CdpEmulator } from "./cdp.js";
import { readSettings, writeSettings } from "./settings.js";

export interface DeviceApiContext {
  root: string;
  previewUrl: string;
  cdp: CdpEmulator | null;
  /** Where settings are kept (tests); the platform's data directory by default. */
  dataDir?: string;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
  /** Opens a URL in the system browser (replaced in tests). */
  openExternal?(url: string): void;
}

/** The system browser, started detached. Only the project's own http URL reaches it (see `open-external`). */
export function openInSystemBrowser(url: string, platform: string = process.platform): void {
  const [cmd, args]: [string, string[]] =
    platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]] : platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true }).on("error", () => undefined).unref();
}

/** Handles `/api/devices/*`; returns false for any other path. */
export async function handleDeviceApi(ctx: DeviceApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const { json } = ctx;
  switch (url.pathname) {
    case "/api/devices/capabilities": {
      const caps: Capabilities = { cdp: !!ctx.cdp && (await ctx.cdp.available()), platform: process.platform };
      json(res, 200, caps);
      return true;
    }
    case "/api/devices/emulation": {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" }), true;
      const body = JSON.parse(await ctx.readBody(req)) as { nonce?: string; emulation?: Emulation };
      if (!ctx.cdp) return json(res, 200, { ok: false, applied: [], error: "No CDP connection on this platform." }), true;
      if (typeof body.nonce !== "string" || !body.emulation) return json(res, 400, { error: "nonce and emulation are required" }), true;
      // The settings sanitiser doubles as validation: only known fields and values reach CDP.
      const emulation = sanitizeSettings({ frames: [{ emulation: body.emulation }] }).frames![0]!.emulation;
      try {
        json(res, 200, { ok: true, applied: await ctx.cdp.apply(body.nonce, emulation) });
      } catch (e) {
        json(res, 200, { ok: false, applied: [], error: e instanceof Error ? e.message : String(e) });
      }
      return true;
    }
    case "/api/devices/throttle": {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" }), true;
      const body = JSON.parse(await ctx.readBody(req)) as { nonce?: string; throttle?: unknown };
      if (!ctx.cdp) return json(res, 200, { ok: false, error: "Throttling needs CDP (the Windows desktop app, or a browser started with a debugging port)." }), true;
      if (typeof body.nonce !== "string") return json(res, 400, { error: "nonce is required" }), true;
      const throttle = sanitizeThrottle(body.throttle);
      try {
        await ctx.cdp.throttle(body.nonce, throttle);
        json(res, 200, { ok: true, throttle });
      } catch (e) {
        json(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      return true;
    }
    case "/api/devices/settings": {
      if (req.method === "POST") json(res, 200, writeSettings(ctx.root, JSON.parse(await ctx.readBody(req)), ctx.dataDir));
      else json(res, 200, readSettings(ctx.root, ctx.dataDir));
      return true;
    }
    case "/api/devices/open-external": {
      // Only the project's own dev server, at a path the shell chose: this is not a general URL opener.
      const body = JSON.parse(await ctx.readBody(req)) as { path?: string };
      const target = new URL(typeof body.path === "string" ? body.path : "/", ctx.previewUrl);
      if (target.origin !== new URL(ctx.previewUrl).origin) return json(res, 400, { error: "only the project's dev server can be opened" }), true;
      (ctx.openExternal ?? openInSystemBrowser)(target.href);
      json(res, 200, { ok: true, url: target.href });
      return true;
    }
  }
  return false;
}
