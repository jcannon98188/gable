// The MCP tools behind the Network panel (TASK-56.20): a frame's requests and network condition, recording real responses
// and saving them as a Scenario, and editing a Scenario's mocks. The frame's side goes through the shell (the panel does the
// same thing, so the human sees it); writes to scenes files go through the edit service like every other source edit, and
// answer with the diff.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ControlCommands } from "../../control-protocol.js";
import { mocksFromRecording, type MockReplyPatch, type NetworkCommandResult, type RecordedResponse } from "../../network.js";
import type { EditService } from "../edit/service.js";
import type { EditResult } from "../edit/types.js";
import { mocksOf } from "../network-api.js";
import { projectFile } from "./targets.js";

type Json = Record<string, unknown> | unknown[];
type Annotated = { title: string; description: string; annotations: Record<string, boolean> };

export interface NetworkToolKit {
  server: McpServer;
  shell<N extends keyof ControlCommands>(name: N, params: ControlCommands[N]["params"], timeoutMs?: number): Promise<ControlCommands[N]["result"]>;
  commit(result: () => EditResult, file: string | null): Promise<Json>;
  live: { readonly root: string; readonly edits: EditService };
  read(name: string, description: string): Annotated;
  write(name: string, description: string, idempotent?: boolean): Annotated;
  guard<A>(body: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult>;
  /** Throws the error the agent reads. */
  fail(message: string): never;
}

const frame = z.string().optional().describe("Frame id from get_status; omit for the selected frame.");

/** A recorded response without its body, unless asked: bodies can be large. */
function brief(r: RecordedResponse, bodies: boolean) {
  const size = r.body === null ? 0 : JSON.stringify(r.body).length;
  return { method: r.method, url: r.url, ...(r.query ? { query: r.query } : {}), status: r.status, contentType: r.contentType, ...(r.skipped ? { skipped: r.skipped } : bodies ? { body: r.body } : { bodyChars: size }) };
}

/** The snapshot as an agent reads it: the condition and recording first, then the requests (the newest last). */
function network(r: NetworkCommandResult, limit: number) {
  const s = r.snapshot;
  const entries = s.entries.slice(-limit);
  return {
    frame: r.frame,
    condition: s.condition,
    recording: s.recording,
    ...(r.note ? { note: r.note } : {}),
    requests: entries.map((e) => ({ kind: e.kind, method: e.method, url: e.url, status: e.status, ...(e.statusText ? { statusText: e.statusText } : {}), ms: e.duration === null ? null : Math.round(e.duration), size: e.size, contentType: e.contentType, initiator: e.initiator, ...(e.error ? { error: e.error } : {}), ...(e.conditioned ? { conditioned: e.conditioned } : {}), ...(e.mock !== undefined ? { mock: e.mock } : {}) })),
    ...(s.entries.length > entries.length || s.dropped ? { omitted: s.entries.length - entries.length + s.dropped } : {}),
  };
}

export function registerNetworkTools(kit: NetworkToolKit): void {
  const { server, shell, commit, live, read, write, guard, fail } = kit;
  const scenes = (file: string) => {
    const f = projectFile(live.root, file);
    if ("error" in f) return fail(f.error);
    if (!/\.scenes\.ts$/.test(f.rel)) fail("Mocks live in *.scenes.ts files.");
    return f.rel;
  };

  server.registerTool(
    "get_network",
    {
      ...read("Get network", "A frame's API requests as the Network panel shows them (fetch and XMLHttpRequest calls, and requests a Scenario's mocks answered: method, absolute URL, status, time, size, content type, the app code that made it), with the frame's network condition and recording state. Status null is pending; 0 failed without a response (see error). The Designer's own and Vite's requests are not listed."),
      inputSchema: { frame, limit: z.number().int().min(1).max(500).default(100).describe("Return the last N requests."), clear: z.boolean().default(false).describe("Empty the log after reading it.") },
    },
    guard(async ({ frame: id, limit, clear }) => network(await shell("network", { action: "get", frame: id, clear }), limit)),
  );

  server.registerTool(
    "set_network_condition",
    {
      ...write("Set network condition", "Puts a network condition on a frame's API requests (kept across reloads of that frame), in every engine: `slow` holds each request back `delay` ms; `error` answers with `status` (a simulated server error); `offline` fails it like a dropped connection and makes navigator.onLine false; `normal` lifts it. `match` narrows it to URLs containing the text. `wholeFrame` (offline only) also takes the whole frame offline over CDP (assets, sockets), which needs the desktop app: a note says so when it is unavailable.", true),
      inputSchema: {
        mode: z.enum(["normal", "slow", "error", "offline"]),
        delay: z.number().int().min(0).max(60000).optional().describe("slow: ms added to each request (default 2000)."),
        status: z.number().int().min(400).max(599).optional().describe("error: the status to answer with (default 500)."),
        match: z.string().max(200).optional().describe("Only requests whose URL contains this text; empty for every API request."),
        wholeFrame: z.boolean().optional().describe("offline: take the whole frame offline over CDP too."),
        frame,
      },
    },
    guard(async ({ mode, delay, status, match, wholeFrame, frame: id }) => {
      const condition = { mode, ...(delay !== undefined ? { delay } : {}), ...(status !== undefined ? { status } : {}), ...(match !== undefined ? { match } : {}), frame: wholeFrame === true };
      const r = await shell("network", { action: "condition", frame: id, condition }, 30000);
      return { frame: r.frame, condition: r.snapshot.condition, ...(r.note ? { note: r.note } : {}) };
    }),
  );

  server.registerTool(
    "record_http",
    {
      ...write("Record HTTP", "Records the real responses to a frame's API requests, to save as a Scenario with save_recording_as_scenario. `start` begins (with `reload`, it starts over and reloads the frame so its first requests are recorded too; recording survives reloads of the frame), `stop` ends it, `clear` discards what was recorded. Use the app (or navigate) between start and save."),
      inputSchema: { action: z.enum(["start", "stop", "clear"]), reload: z.boolean().default(false).describe("start: discard earlier records and reload the frame first."), frame },
    },
    guard(async ({ action, reload, frame: id }) => {
      const params = action === "start" ? { on: true, ...(reload ? { clear: true, reload: true } : {}) } : action === "stop" ? { on: false } : { clear: true };
      const r = await shell("network", { action: "record", frame: id, ...params }, 40000);
      return { frame: r.frame, recording: r.snapshot.recording, ...(r.note ? { note: r.note } : {}) };
    }),
  );

  server.registerTool(
    "get_recording",
    {
      ...read("Get recorded responses", "What record_http has recorded in a frame, oldest first: method, URL (without its query, which is what a mock matches), status, content type, and the body's size (or the body, with `bodies`). A response whose body was not kept (binary, over 512 KB) says why; it cannot become a mock."),
      inputSchema: { bodies: z.boolean().default(false).describe("Include each recorded body."), frame },
    },
    guard(async ({ bodies, frame: id }) => {
      const r = await shell("network", { action: "recording", frame: id });
      const records = r.records ?? [];
      return { frame: r.frame, recording: r.snapshot.recording, records: records.map((x) => brief(x, bodies)), mocks: mocksFromRecording(records).mocks.length };
    }),
  );

  server.registerTool(
    "save_recording_as_scenario",
    {
      ...write("Save recording as Scenario", "Writes what record_http recorded as a new Scenario of a scenes file: one mock per method and URL (the last response wins), each answering with the recorded status and body. A minimal patch with undo; answers with the diff, and lists responses left out. Apply it with set_scenario (page mode) or select_scene."),
      inputSchema: {
        file: z.string().describe("The *.scenes.ts file, project-relative (e.g. src/app.scenes.ts)."),
        name: z.string().min(1).describe("The new Scenario's name."),
        description: z.string().optional(),
        url: z.string().optional().describe("Page mode: the URL the Scenario opens the app at, e.g. /users."),
        frame,
      },
    },
    guard(async ({ file, name, description, url, frame: id }) => {
      const rel = scenes(file);
      const r = await shell("network", { action: "recording", frame: id });
      const { mocks, left } = mocksFromRecording(r.records ?? []);
      if (!mocks.length) fail(left.length ? `None of the ${left.length} recorded responses can be a mock (${left[0]!.why}).` : "Nothing was recorded: call record_http with start, use the app, then save.");
      const out = await commit(() => live.edits.apply({ op: "addMockScene", file: rel, name, description, url, mocks }), rel);
      return { ...out, mocks: mocks.map((m) => `${m.method} ${m.url} → ${m.status}`), ...(left.length ? { left } : {}) };
    }),
  );

  server.registerTool(
    "list_mocks",
    {
      ...read("List mocks", "The HTTP mocks of every scene of a scenes file, as written: method, URL, and the reply (status, delay, error, body). A computed reply (a function) or a computed list is listed as read-only with the reason; edit_mock and remove_mock take the scene and index shown here."),
      inputSchema: { file: z.string().describe("The *.scenes.ts file, project-relative.") },
    },
    guard(async ({ file }) => {
      const r = mocksOf(live.root, "/" + scenes(file));
      if (!r.ok) fail(`${r.code}: ${r.error}`);
      return r;
    }),
  );

  server.registerTool(
    "edit_mock",
    {
      ...write("Edit mock", "Changes one mock's reply in a scenes file: each field given is set, and null removes it (status null answers 200; delay null or 0 answers at once; error 'network' or 'abort' fails the request instead of answering). Only those properties are rewritten. `expectUrl` refuses the edit if the mock at that index is no longer for that URL."),
      inputSchema: {
        file: z.string().describe("The *.scenes.ts file, project-relative."),
        scene: z.string(),
        index: z.number().int().min(0).describe("The mock's index in the scene's http list (list_mocks)."),
        expectUrl: z.string().optional(),
        status: z.number().int().min(100).max(599).nullable().optional(),
        delay: z.number().int().min(0).max(60000).nullable().optional(),
        error: z.enum(["network", "abort"]).nullable().optional(),
        body: z.unknown().optional().describe("The JSON body (any JSON value); null removes the body."),
      },
    },
    guard(async ({ file, scene, index, expectUrl, status, delay, error, body }) => {
      const rel = scenes(file);
      const reply: MockReplyPatch = { ...(status !== undefined ? { status } : {}), ...(delay !== undefined ? { delay } : {}), ...(error !== undefined ? { error } : {}), ...(body !== undefined ? { body } : {}) };
      if (!Object.keys(reply).length) fail("Give at least one of status, delay, error, body.");
      return commit(() => live.edits.apply({ op: "setMock", file: rel, scene, index, reply, expectUrl }), rel);
    }),
  );

  server.registerTool(
    "remove_mock",
    {
      ...write("Remove mock", "Removes one mock from a scene's http list in a scenes file (a minimal patch with undo). `expectUrl` refuses it if the mock at that index is no longer for that URL."),
      inputSchema: { file: z.string(), scene: z.string(), index: z.number().int().min(0), expectUrl: z.string().optional() },
    },
    guard(async ({ file, scene, index, expectUrl }) => {
      const rel = scenes(file);
      return commit(() => live.edits.apply({ op: "removeMock", file: rel, scene, index, expectUrl }), rel);
    }),
  );
}
