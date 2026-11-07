// Signal values as the Designer edits them: plain JSON data, checked against the value the signal holds now (its runtime type is
// all the Designer knows of its declared type), and printed back as a TypeScript literal when a poked state is saved as a Scenario.
// Shared by the Preview agent (validation before a write), the shell and the server (the Scenario writer).

/** Parses edit text: JSON, or `undefined`. */
export function parseValue(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = text.trim();
  if (t === "undefined") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  switch (typeof value) {
    case "object":
      return "an object";
    case "undefined":
      return "undefined";
    default:
      return `a ${typeof value}`;
  }
}

const MAX_PROBLEMS = 8;

/**
 * Where `next` does not have the shape of `current`: a different kind of value, an array element unlike the existing ones, or an
 * object with keys missing or added. Empty when it fits. `current` null or undefined accepts anything (its type is unknown), and
 * so does an empty array's element.
 */
export function shapeProblems(current: unknown, next: unknown, path = "value"): string[] {
  const out: string[] = [];
  check(current, next, path, out);
  return out.slice(0, MAX_PROBLEMS);
}

function check(current: unknown, next: unknown, path: string, out: string[]): void {
  if (out.length >= MAX_PROBLEMS || current === null || current === undefined) return;
  const was = kindOf(current);
  const is = kindOf(next);
  if (was !== is) {
    out.push(`${path} was ${was}, not ${is}.`);
    return;
  }
  if (Array.isArray(current)) {
    if (current.length === 0) return;
    (next as unknown[]).forEach((item, i) => check(current[0], item, `${path}[${i}]`, out));
    return;
  }
  if (typeof current !== "object") return;
  const a = current as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  for (const key of Object.keys(a)) {
    if (!(key in b)) out.push(`${path}.${key} is missing.`);
    else check(a[key], b[key], `${path}.${key}`, out);
  }
  for (const key of Object.keys(b)) if (!(key in a)) out.push(`${path}.${key} is new.`);
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A TypeScript literal for plain data, with the file's string quote and identifier keys unquoted: `{ count: 3, tags: ['a'] }`. */
export function jsLiteral(value: unknown, quote: "'" | '"' = '"'): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return quoteString(value, quote);
  if (Array.isArray(value)) return `[${value.map((v) => jsLiteral(v, quote)).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  return `{ ${entries.map(([k, v]) => `${IDENT.test(k) ? k : quoteString(k, quote)}: ${jsLiteral(v, quote)}`).join(", ")} }`;
}

function quoteString(text: string, quote: "'" | '"'): string {
  const json = JSON.stringify(text);
  if (quote === '"') return json;
  return `'${json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
}

interface FieldLike {
  field: string;
  kind: "input" | "state";
  text: string | null;
  error?: string;
  poked: boolean;
  changed: boolean;
}

/** The fields "Save as Scenario" writes when none are named: what was set from the Designer or changed since the scene mounted. */
export function defaultSceneFields(fields: FieldLike[]): string[] {
  return fields.filter((f) => (f.poked || f.changed) && f.text !== null).map((f) => f.field);
}

/** The `inputs` and `state` of a Scene that holds the named fields' current values, or why it cannot. */
export function sceneValues(fields: FieldLike[], names: string[]): { ok: true; inputs: Record<string, unknown>; state: Record<string, unknown> } | { ok: false; error: string } {
  if (!names.length) return { ok: false, error: "Choose at least one value to save." };
  const inputs: Record<string, unknown> = {};
  const state: Record<string, unknown> = {};
  for (const name of names) {
    const f = fields.find((x) => x.field === name);
    if (!f) return { ok: false, error: `${name} is not an input or writable signal of the mounted component.` };
    if (f.text === null) return { ok: false, error: `${name} cannot be saved: ${f.error ?? "its value is not plain data"}` };
    const v = parseValue(f.text);
    if (!v.ok || v.value === undefined) return { ok: false, error: `${name} is undefined, which a Scene cannot hold; leave it out.` };
    (f.kind === "input" ? inputs : state)[f.field] = v.value;
  }
  return { ok: true, inputs, state };
}
