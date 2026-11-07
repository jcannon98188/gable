import { readFileSync } from "node:fs";
import { gable } from "@gable/vite";
import { defineConfig, type Plugin } from "vite";

// The fixture's own backend, served by its dev server: the users come from api/users.json, and /api/hits counts the
// requests that really reached it (the Network check reads it to tell a mocked answer from a real one); POST /api/login
// sets a session cookie, HttpOnly, for the Storage check.
const hits: Record<string, number> = {};
function api(): Plugin {
  return {
    name: "net-fixture-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0]!;
        if (!path.startsWith("/api/")) return next();
        hits[path] = (hits[path] ?? 0) + 1;
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        if (path === "/api/users") return void res.end(readFileSync(new URL("./api/users.json", import.meta.url), "utf8"));
        if (path === "/api/status") return void res.end(JSON.stringify({ ok: true, server: "vite" }));
        if (path === "/api/hits") return void res.end(JSON.stringify(hits));
        if (path === "/api/login" && req.method === "POST") {
          // A session cookie the page cannot read (HttpOnly), and one it can. SameSite=None; Secure because in the browser
          // the Designer's window (127.0.0.1) makes the frame (localhost) a third-party iframe, where only those are kept.
          res.setHeader("set-cookie", ["sid=s3ss10n; Path=/; HttpOnly; SameSite=None; Secure", "seen=1; Path=/; SameSite=None; Secure"]);
          return void res.end(JSON.stringify({ ok: true }));
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `No ${path}` }));
      });
    },
  };
}

export default defineConfig({ plugins: [gable(), api()] });
