// MCP tools for signal state editing (TASK-56.17): set or pin a signal of the running app in the selected frame, read what a
// Scene could hold, and save it as a new Scenario. Writes to the app go through the shell (the Inspector's service, so the
// window shows them); the Scenario is a source edit through the EditService, so it answers with its diff and undo takes it back.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ComponentDetail } from "@gable/core/devtools";
import type { ControlCommands, SignalsResult } from "../../control-protocol.js";
import { defaultSceneFields, sceneValues } from "../../signal-value.js";
import type { EditService } from "../edit/service.js";
import type { EditResult } from "../edit/types.js";

type Annotated = { title: string; description: string; annotations: Record<string, boolean> };

export interface SignalToolKit {
  shell<N extends keyof ControlCommands>(name: N, params: ControlCommands[N]["params"], timeoutMs?: number): Promise<ControlCommands[N]["result"]>;
  commit(result: () => EditResult, file: string | null): Promise<unknown>;
  live: { readonly edits: EditService };
  guard<A>(body: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult>;
  /** Throws an error the agent reads as the tool's answer. */
  fail(message: string): never;
  read(name: string, description: string): Annotated;
  write(name: string, description: string, idempotent?: boolean): Annotated;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const addressing = {
  id: z.string().optional().describe("Signal id from get_signals. Or name it with `name` (and `component`)."),
  name: z.string().optional().describe("Field name of the signal or input on the component, e.g. count."),
  component: z.string().optional().describe("Component instance id from get_tree, with `name`; omit for the selection's owner, or the mounted component in component mode."),
};

export function registerSignalTools(server: McpServer, kit: SignalToolKit): void {
  const { shell, guard, fail, read, write } = kit;

  /** A signal id from an id, or a field name on a component (the selection's owner, else the root of component mode). */
  const resolve = async ({ id, name, component }: { id?: string; name?: string; component?: string }): Promise<string> => {
    if (id) return id;
    if (!name) fail("Pass the signal's id (from get_signals) or its field name.");
    let detail = (await shell("inspect", { what: "component", ...(component ? { id: component } : {}) })) as ComponentDetail | null;
    if (!detail && !component) {
      const scene = (await shell("signals", { action: "report" })).scene;
      const field = scene?.fields.find((f) => f.field === name);
      if (field) return field.id;
    }
    if (!detail) fail(component ? `No component instance ${component} is rendered.` : "No component is selected; pass `component` (an id from get_tree) or the signal's id.");
    detail = detail!;
    const hit = [...detail.signals, ...detail.inputs].find((s) => s.name === name);
    if (!hit) fail(`${detail.name} has no signal or input named "${name}". It has: ${[...detail.inputs, ...detail.signals].map((s) => s.name).join(", ") || "none"}.`);
    return hit!.id;
  };

  const answer = (r: SignalsResult) => {
    if (r.write && !r.write.ok) fail(`${r.write.error}${r.write.problems?.length ? `\n- ${r.write.problems.join("\n- ")}\nPass force: true to write it anyway.` : ""}`);
    return { ok: true, pins: r.pins };
  };

  const value = z.string().describe('The new value as JSON text, e.g. 3, "Ada", {"done":true}, or undefined. It must have the shape of the current value (same kind, same object keys) unless `force`.');

  server.registerTool(
    "set_signal",
    {
      ...write("Set signal", "Writes a value to a writable signal or input of the running app in the selected frame, as the Inspector's Edit does. The value is checked against the shape of the current one; the view updates after the next flush. In component mode the change shows in get_scene_state and can be kept with save_scenario."),
      inputSchema: { ...addressing, value, force: z.boolean().default(false).describe("Write even when the shape differs from the current value.") },
    },
    guard(async ({ id, name, component, value: text, force }) => answer(await shell("signals", { action: "set", id: await resolve({ id, name, component }), text, force }))),
  );

  server.registerTool(
    "pin_signal",
    {
      ...write("Pin signal", "Pins a signal to a value: written now and again whenever the app changes it, until unpinned (value: null). A pin the app overwrites more than 20 times a second is suspended, with the reason in the answer's pins. Pins last until the frame reloads.", true),
      inputSchema: { ...addressing, value: value.nullable().describe("JSON text to pin to, or null to unpin."), force: z.boolean().default(false) },
    },
    guard(async ({ id, name, component, value: text, force }) => answer(await shell("signals", { action: "pin", id: await resolve({ id, name, component }), text, force }))),
  );

  server.registerTool(
    "get_scene_state",
    read("Get scene state", "Component mode: the mounted component's inputs and writable signals with their current values as JSON, which were set from the Designer (poked) or changed since the scene mounted, signals that were set but cannot be saved (a child's or a service's), and the active pins."),
    guard(async () => {
      const r = await shell("signals", { action: "report" });
      if (!r.scene) fail("Not in component mode, or no scene is mounted: use show_component first.");
      return { ...r.scene, pins: r.pins, wouldSave: defaultSceneFields(r.scene!.fields) };
    }),
  );

  server.registerTool(
    "save_scenario",
    {
      ...write("Save as Scenario", "Component mode: writes a new scene into the scenes file: a copy of the mounted scene with the current values of the chosen fields (inputs go into `inputs`, signals into `state`), then mounts it. Answers with the diff; undo takes it back."),
      inputSchema: {
        name: z.string().describe("The new scene's name."),
        description: z.string().optional(),
        fields: z.array(z.string()).optional().describe("Field names to save; omit for what was set from the Designer or changed since the scene mounted (see get_scene_state)."),
      },
    },
    guard(async ({ name, description, fields }) => {
      const scene = (await shell("signals", { action: "report" })).scene;
      if (!scene) fail("Not in component mode, or no scene is mounted: use show_component first.");
      const s = scene!;
      const values = sceneValues(s.fields, fields ?? defaultSceneFields(s.fields));
      if (!values.ok) fail(values.error);
      const { inputs, state } = values as Extract<typeof values, { ok: true }>;
      const out = (await kit.commit(
        () =>
          kit.live.edits.apply({
            op: "addScene",
            file: s.module,
            name,
            description: description ?? "",
            from: s.scene,
            ...(Object.keys(inputs).length ? { inputs } : {}),
            ...(Object.keys(state).length ? { state } : {}),
          }),
        s.module.replace(/^\//, ""),
      )) as Record<string, unknown>;
      // The scenes file's hot update lists the new scene; then show it, as the Inspector's button does.
      let shown = false;
      for (let i = 0; i < 60 && !shown; i++) {
        const listed = (await shell("inspect", { what: "scenes" }).catch(() => null)) as { scenes?: Array<{ name: string }> } | null;
        if (listed?.scenes?.some((x) => x.name === name.trim())) {
          await shell("setScene", { name: name.trim() });
          shown = true;
        } else await sleep(250);
      }
      return { ...out, shown, ...(shown ? {} : { note: "The scene was written but the frame has not listed it yet; set_scene shows it once the hot update lands." }) };
    }),
  );
}
