// The MCP tools behind the Storage panel (TASK-56.21): a frame's localStorage, sessionStorage and cookies, read and edited
// through the shell (the panel does the same thing, so the human sees it). Cookies go over CDP where the backend has it
// (every cookie, HttpOnly ones and attributes included), otherwise through the page, and the answer says which.
import { z } from "zod";
import type { CookieRow, StorageCommandResult, StorageItem } from "../../storage.js";
import type { NetworkToolKit } from "./network-tools.js";

export type StorageToolKit = Pick<NetworkToolKit, "server" | "shell" | "read" | "write" | "guard">;

const frame = z.string().optional().describe("Frame id from get_status; omit for the selected frame.");
const area = z.enum(["local", "session"]).describe("localStorage or sessionStorage.");

/** A value cut to `max` characters, saying how long it was. */
function cut(value: string, max: number) {
  return value.length > max ? { value: value.slice(0, max), truncated: value.length } : { value };
}

function items(list: StorageItem[] | null, filter: string, max: number) {
  if (!list) return null;
  const f = filter.toLowerCase();
  return list.filter((i) => !f || i.key.toLowerCase().includes(f) || i.value.toLowerCase().includes(f)).map((i) => ({ key: i.key, ...cut(i.value, max) }));
}

function cookies(list: CookieRow[], filter: string, max: number) {
  const f = filter.toLowerCase();
  return list
    .filter((c) => !f || c.name.toLowerCase().includes(f) || c.value.toLowerCase().includes(f))
    .map((c) =>
      c.attributes
        ? { name: c.name, ...cut(c.value, max), domain: c.domain, path: c.path, expires: c.session ? "session" : new Date(c.expires * 1000).toISOString(), size: c.size, httpOnly: c.httpOnly, secure: c.secure, ...(c.sameSite ? { sameSite: c.sameSite } : {}) }
        : { name: c.name, ...cut(c.value, max) },
    );
}

/** The result as an agent reads it: where the cookies came from, then the areas asked for. */
function view(r: StorageCommandResult, which: "local" | "session" | "cookies" | "all", filter = "", max = 2000) {
  const s = r.snapshot;
  return {
    frame: r.frame,
    origin: s.origin,
    ...(which === "all" || which === "local" ? { localStorage: items(s.local, filter, max) } : {}),
    ...(which === "all" || which === "session" ? { sessionStorage: items(s.session, filter, max) } : {}),
    ...(which === "all" || which === "cookies" ? { cookies: cookies(r.cookies, filter, max), cookiesVia: r.cookiesVia } : {}),
    ...(Object.keys(s.errors).length ? { errors: s.errors } : {}),
    ...(s.hidden ? { designerKeysHidden: s.hidden } : {}),
    ...(r.note && (which === "all" || which === "cookies") ? { note: r.note } : {}),
    ...(r.thirdParty && (which === "all" || which === "cookies") ? { thirdParty: r.thirdParty } : {}),
  };
}

export function registerStorageTools(kit: StorageToolKit): void {
  const { server, shell, read, write, guard } = kit;

  server.registerTool(
    "get_storage",
    {
      ...read("Get storage", "A frame's localStorage, sessionStorage and cookies, as the Storage panel shows them (each frame has its own origin, so its own storage). Cookies come with domain, path, expiry and flags, HttpOnly ones included, over CDP (the desktop app); elsewhere only the cookies the page can see, by name and value (`cookiesVia: \"page\"`, with a note). The Designer's own keys are left out and counted. A null area is one the page cannot use (see errors)."),
      inputSchema: {
        area: z.enum(["local", "session", "cookies", "all"]).default("all"),
        filter: z.string().default("").describe("Only keys/names or values containing this text."),
        maxValue: z.number().int().min(10).max(100000).default(2000).describe("Cut values longer than this (the full length is given)."),
        frame,
      },
    },
    guard(async ({ area: which, filter, maxValue, frame: id }) => view(await shell("storage", { action: "get", frame: id }), which, filter, maxValue)),
  );

  server.registerTool(
    "set_storage_item",
    {
      ...write("Set storage item", "Writes a localStorage or sessionStorage item in a frame, as the page's own code would (the app sees it on its next read; a full storage fails with the browser's error). The Designer's own keys are refused.", true),
      inputSchema: { area, key: z.string().min(1), value: z.string(), frame },
    },
    guard(async ({ area: a, key, value, frame: id }) => view(await shell("storage", { action: "set", frame: id, area: a, key, value }), a)),
  );

  server.registerTool(
    "remove_storage_item",
    {
      ...write("Remove storage item", "Removes a localStorage or sessionStorage item from a frame.", true),
      inputSchema: { area, key: z.string().min(1), frame },
    },
    guard(async ({ area: a, key, frame: id }) => view(await shell("storage", { action: "remove", frame: id, area: a, key }), a)),
  );

  server.registerTool(
    "clear_storage",
    {
      ...write("Clear storage", "Removes every item of a frame's localStorage or sessionStorage except the Designer's own. Not undoable: the values are not kept.", true),
      inputSchema: { area, frame },
    },
    guard(async ({ area: a, frame: id }) => view(await shell("storage", { action: "clear", frame: id, area: a }), a)),
  );

  server.registerTool(
    "set_cookie",
    {
      ...write("Set cookie", "Writes a cookie for a frame's URL: over CDP where there is CDP (as a server's Set-Cookie would; httpOnly allowed), else through document.cookie (httpOnly refused). maxAge in seconds, omitted for a session cookie, 0 to expire it. A cookie on another path or domain is a separate cookie.", true),
      inputSchema: {
        name: z.string().min(1),
        value: z.string(),
        path: z.string().optional().describe("Default /."),
        domain: z.string().optional(),
        maxAge: z.number().int().optional(),
        sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
        secure: z.boolean().optional(),
        httpOnly: z.boolean().optional().describe("Needs CDP."),
        frame,
      },
    },
    guard(async ({ frame: id, ...cookie }) => view(await shell("storage", { action: "setCookie", frame: id, cookie }), "cookies")),
  );

  server.registerTool(
    "delete_cookie",
    {
      ...write("Delete cookie", "Deletes a frame's cookie by name (on `path`/`domain` when given; otherwise over CDP every cookie of that name for the frame's URL, or through the page on every path of its URL). Fails, saying why, when the cookie is still there.", true),
      inputSchema: { name: z.string().min(1), path: z.string().optional(), domain: z.string().optional(), frame },
    },
    guard(async ({ frame: id, name, path, domain }) => view(await shell("storage", { action: "deleteCookie", frame: id, cookie: { name, ...(path ? { path } : {}), ...(domain ? { domain } : {}) } }), "cookies")),
  );
}

/** The type the tool results are checked against in tests. */
export type StorageView = ReturnType<typeof view>;
export { view as storageView };
