// MCP tools for design tokens (TASK-56.23): list the project's CSS custom properties with their light and dark values,
// find where one is used, and edit one. Reads come from the token index (tokens/model.ts); the edit is the `setToken` op of
// the edit service, so it is the same minimal patch, on the same undo history, as an edit in the Tokens tab.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { EditService } from "../edit/service.js";
import type { EditResult } from "../edit/types.js";
import type { TailwindService } from "../tailwind/api.js";
import { tokenService } from "../tokens/api.js";
import type { TokenDef, TokenInfo, TokenTarget } from "../tokens/types.js";

type Annotations = { title: string; description: string; annotations: Record<string, boolean> };

export interface TokenToolDeps {
  root(): string;
  edits(): EditService;
  tailwind(): TailwindService;
  /** control.ts's commit: applies the edit, tells the shell the history changed and returns the diff. */
  commit(result: () => EditResult, file: string | null): Promise<unknown>;
  read(name: string, description: string): Annotations;
  write(name: string, description: string, idempotent?: boolean): Annotations;
  guard<A>(body: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult>;
}

const where = (t: TokenTarget | null) => (t ? { file: t.file, context: [...t.atRules, ...(t.selector !== null ? [t.selector] : [])].join(" "), current: t.expect, ...(t.override ? { override: true } : {}) } : null);
const definition = (d: TokenDef) => ({
  file: d.file,
  line: d.line,
  context: d.context,
  value: d.value,
  scheme: d.scheme,
  scope: d.scope,
  ...(d.editable ? {} : { readOnly: "package stylesheet: an edit writes an override in the project stylesheet that imports it" }),
  ...(d.overriddenBy ? { overriddenBy: d.overriddenBy } : {}),
});
const summary = (t: TokenInfo) => ({
  name: t.name,
  kind: t.kind,
  light: t.light,
  dark: t.dark,
  uses: t.uses,
  ...(t.refs.length ? { reads: t.refs } : {}),
  ...(t.aliases.length ? { aliases: t.aliases } : {}),
  definitions: t.defs.map(definition),
  edit: { light: where(t.edit.light), dark: where(t.edit.dark), ...(t.edit.why ? { why: t.edit.why } : {}) },
});

export function registerTokenTools(server: McpServer, deps: TokenToolDeps): void {
  const index = () => tokenService(deps.root()).index(deps.tailwind());

  server.registerTool(
    "list_tokens",
    {
      ...deps.read(
        "List design tokens",
        "The project's design tokens: CSS custom properties from its stylesheets and the package stylesheets they @import (read-only; edits override them), with the light and dark value (`resolved` follows var() through other tokens), every definition with its context (:root, .dark, @media (prefers-color-scheme: dark) :root, [data-theme=...], @theme, a component selector) and which one overrides which, and how many places use each (CSS var() and template elements, through classes too).",
      ),
      inputSchema: {
        filter: z.string().optional().describe("Substring of the token name (e.g. primary)."),
        kind: z.enum(["color", "length", "number", "other"]).optional(),
      },
    },
    deps.guard(async ({ filter, kind }: { filter?: string; kind?: TokenInfo["kind"] }) => {
      const { list } = await index();
      const tokens = list.tokens.filter((t) => (!filter || t.name.includes(filter)) && (!kind || t.kind === kind));
      return { tokens: tokens.map(summary), darkVia: list.darkVia, sheets: list.sheets, classesMatched: list.tailwind ? "through the project's Tailwind design system" : "Tailwind mode is off: classes are matched only by var() written in them" };
    }),
  );

  server.registerTool(
    "get_token_usages",
    {
      ...deps.read(
        "Get token usages",
        "Where a token is used: CSS declarations that read it with var() and template elements whose style or classes read it, also through its aliases (`via`). Each template use has `select.target` and each CSS use `select.selector` to pass to select_element.",
      ),
      inputSchema: { name: z.string().describe("The custom property, e.g. --primary.") },
    },
    deps.guard(async ({ name }: { name: string }) => {
      const r = await tokenService(deps.root()).usages(name, deps.tailwind());
      if (!r.ok) throw new Error(r.error);
      return {
        name,
        count: r.usages.length,
        aliases: r.aliases,
        usages: r.usages.map((u) => ({
          kind: u.kind,
          file: u.file,
          line: u.line,
          column: u.column,
          text: u.text,
          ...(u.via ? { via: u.via } : {}),
          ...(u.kind === "css" ? { property: u.property, context: u.context } : { tag: u.tag, ...(u.className ? { className: u.className } : {}) }),
          ...(u.readOnly ? { readOnly: true } : {}),
          select: u.kind === "css" ? (u.selector ? { selector: u.selector } : null) : { target: { file: u.file, line: u.line, column: u.column } },
        })),
      };
    }),
  );

  server.registerTool(
    "set_token",
    {
      ...deps.write(
        "Set a design token",
        "Sets a token's value as one minimal patch of its definition (undo and redo as for every edit). scheme light edits the definition that wins outside dark mode; dark edits the dark one, or adds it in the project's dark context (.dark or prefers-color-scheme, whichever the project uses). A token from a package stylesheet is overridden in the project stylesheet that imports it. `context` edits one definition as list_tokens lists it (a [data-theme] variant, a component scope); value null removes that definition (an override, for instance).",
      ),
      inputSchema: {
        name: z.string().describe("The custom property, e.g. --primary."),
        value: z.string().nullable().describe("A plain CSS value (oklch(0.6 0.2 250), 8px, var(--other)); null removes the definition named by context."),
        scheme: z.enum(["light", "dark"]).default("light"),
        context: z.string().optional().describe("Edit the definition with this context (from list_tokens definitions[].context) instead of the light/dark one."),
        file: z.string().optional().describe("With context: the definition's file, when two files define the token in the same context."),
      },
    },
    deps.guard(async ({ name, value, scheme, context, file }: { name: string; value: string | null; scheme: "light" | "dark"; context?: string; file?: string }) => {
      const { byName } = await index();
      const t = byName.get(name);
      if (!t) throw new Error(`No token ${name} in this project's stylesheets. list_tokens lists them.`);
      let target: TokenTarget | null;
      if (context !== undefined) {
        const matches = t.defs.filter((d) => d.context === context && (!file || d.file === file || d.target?.file === file));
        const d = matches[matches.length - 1];
        if (!d) throw new Error(`${name} has no definition in ${context}${file ? ` in ${file}` : ""}. Its contexts: ${[...new Set(t.defs.map((x) => x.context))].join("; ")}.`);
        target = d.target;
        if (!target) throw new Error(`That definition of ${name} is in a nested rule; edit it in code (${d.file}:${d.line}).`);
      } else {
        if (value === null) throw new Error("Removing a definition needs its context (list_tokens definitions[].context).");
        target = scheme === "dark" ? t.edit.dark : t.edit.light;
        if (!target) throw new Error(t.edit.why ?? `${name} has no ${scheme} definition that can be edited here.`);
      }
      const tg = target;
      const result = (await deps.commit(
        () => deps.edits().apply({ op: "setToken", file: tg.file, name, selector: tg.selector, atRules: tg.atRules, value, expect: tg.expect }),
        tg.file,
      )) as Record<string, unknown>;
      return { ...result, ...(tg.override ? { note: `${name} is defined in a package stylesheet; this writes an override in ${tg.file}.` } : {}) };
    }),
  );
}
