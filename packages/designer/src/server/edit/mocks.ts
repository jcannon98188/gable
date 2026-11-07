// The HTTP mocks of a scenes file: reading them (literal values only, nothing is executed) and writing them back as minimal
// text patches. A recording becomes a new Scenario (the empty scene `planScene` would add, with its `http` list filled in);
// one mock's reply can be changed or the mock removed. The file is the truth (ADR 0001): every write is a hunk with a reverse.
import ts from "@typescript/typescript6";
import type { MockInfo, MockReplyPatch, MockSpec, SceneMocks } from "../../network.js";
import type { Hunk } from "./hunks.js";
import { planScene, scenesObject } from "./scenario.js";
import { fail } from "./template.js";
import type { EditError, EditOp } from "./types.js";

type AddMockScene = Extract<EditOp, { op: "addMockScene" }>;
type SetMock = Extract<EditOp, { op: "setMock" }>;
type RemoveMock = Extract<EditOp, { op: "removeMock" }>;
export type MockOp = AddMockScene | SetMock | RemoveMock;
type Plan = { hunks: Hunk[]; label: string } | EditError;

const unwrap = (e: ts.Expression): ts.Expression => (ts.isSatisfiesExpression(e) || ts.isAsExpression(e) || ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);
const keyOf = (n: ts.PropertyName): string | null => (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;
const indentOf = (s: string, i: number) => /^[ \t]*/.exec(s.slice(lineStart(s, i)))![0];
const unitOf = (text: string) => /^[ \t]+/m.exec(text)?.[0] ?? "  ";
const parse = (text: string) => ts.createSourceFile("x.scenes.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const quoteOf = (sf: ts.SourceFile) => (sf.statements.find(ts.isImportDeclaration)?.moduleSpecifier.getText(sf)[0] === '"' ? '"' : "'");
const str = (value: string, quote: string) => quote + value.replaceAll("\\", "\\\\").replaceAll(quote, "\\" + quote) + quote;

const NOT_LITERAL = Symbol("not literal");

/** The value of a literal written in the file (strings, numbers, booleans, null, arrays and objects of them), or NOT_LITERAL. */
export function literalValue(node: ts.Expression): unknown {
  const e = unwrap(node);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return -Number(e.operand.text);
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (e.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (e.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(e)) {
    const out: unknown[] = [];
    for (const el of e.elements) {
      if (ts.isSpreadElement(el) || ts.isOmittedExpression(el)) return NOT_LITERAL;
      const v = literalValue(el);
      if (v === NOT_LITERAL) return NOT_LITERAL;
      out.push(v);
    }
    return out;
  }
  if (ts.isObjectLiteralExpression(e)) {
    const out: Record<string, unknown> = {};
    for (const p of e.properties) {
      const k = ts.isPropertyAssignment(p) ? keyOf(p.name) : null;
      if (!ts.isPropertyAssignment(p) || k === null) return NOT_LITERAL;
      const v = literalValue(p.initializer);
      if (v === NOT_LITERAL) return NOT_LITERAL;
      out[k] = v;
    }
    return out;
  }
  return NOT_LITERAL;
}

const propOf = (obj: ts.ObjectLiteralExpression, key: string): ts.PropertyAssignment | undefined =>
  obj.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && keyOf(p.name) === key);

/** Every scene of the file with its mocks as written. */
export function readMocks(text: string): SceneMocks[] | EditError {
  const sf = parse(text);
  const scenes = scenesObject(sf);
  if ("ok" in scenes) return scenes;
  const out: SceneMocks[] = [];
  for (const p of scenes.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const name = keyOf(p.name);
    if (name === null) continue;
    const obj = unwrap(p.initializer);
    if (!ts.isObjectLiteralExpression(obj)) {
      out.push({ scene: name, mocks: [], readonly: "The scene is computed, so its mocks are not edited here." });
      continue;
    }
    const http = propOf(obj, "http");
    const list = http && unwrap(http.initializer);
    if (!http || !list) out.push({ scene: name, mocks: [], readonly: null });
    else if (!ts.isArrayLiteralExpression(list)) out.push({ scene: name, mocks: [], readonly: "The scene's `http` is computed, so its mocks are not edited here." });
    else out.push({ scene: name, mocks: list.elements.map((el, index) => mockInfo(sf, el, index)), readonly: null });
  }
  return out;
}

function mockInfo(sf: ts.SourceFile, el: ts.Expression, index: number): MockInfo {
  const e = unwrap(el);
  if (!ts.isObjectLiteralExpression(e)) return { index, method: null, url: el.getText(sf), reply: null, readonly: "The mock is computed." };
  const method = propOf(e, "method");
  const url = propOf(e, "url");
  const m = method ? literalValue(method.initializer) : null;
  const u = url ? unwrap(url.initializer) : null;
  const info: MockInfo = {
    index,
    method: typeof m === "string" ? m : null,
    url: u && (ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u)) ? u.text : (u?.getText(sf) ?? ""),
    reply: null,
    readonly: null,
  };
  const reply = propOf(e, "reply");
  const r = reply && unwrap(reply.initializer);
  if (!r || !ts.isObjectLiteralExpression(r)) return { ...info, readonly: "The reply is computed (a function of the request), so it is shown but not edited." };
  const field = (k: string) => {
    const p = propOf(r, k);
    return p ? literalValue(p.initializer) : undefined;
  };
  const status = field("status");
  const delay = field("delay");
  const error = field("error");
  const body = field("body");
  const computed = [status, delay, error, body].some((v) => v === NOT_LITERAL) || r.properties.some((p) => !ts.isPropertyAssignment(p));
  info.reply = {
    status: typeof status === "number" ? status : null,
    delay: typeof delay === "number" ? delay : null,
    error: typeof error === "string" ? error : null,
    body: body === NOT_LITERAL || body === undefined ? null : body,
    hasBody: body !== undefined,
  };
  if (computed) info.readonly = "Part of the reply is computed, so it is shown but not edited.";
  return info;
}

// --- writing ---------------------------------------------------------------------------------------------------------

const METHOD = /^[A-Z]{3,10}$/;
const MAX_JSON = 1_000_000;

function jsonOf(value: unknown): string | EditError {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    return fail("invalid", "The body is not JSON (it has a cycle or a value JSON cannot hold).");
  }
  if (json === undefined) return "null";
  if (json.length > MAX_JSON) return fail("invalid", "The body is over 1 MB; a scenes file is not the place for it.");
  return json;
}

/** A JSON value as TypeScript at `indent`: on one line when short, else pretty-printed with the file's indent unit. */
function render(value: unknown, indent: string, unit: string): string {
  const flat = JSON.stringify(value) ?? "null";
  if (flat.length <= 80) return flat;
  return JSON.stringify(value, null, unit).split("\n").join("\n" + indent);
}

function checkMock(m: MockSpec, i: number): EditError | null {
  if (!m || typeof m !== "object") return fail("invalid", `Mock ${i + 1} is not an object.`);
  if (typeof m.method !== "string" || !METHOD.test(m.method)) return fail("invalid", `Mock ${i + 1}: the method must be an HTTP method in capitals.`);
  if (typeof m.url !== "string" || m.url === "" || /[\n\r`]/.test(m.url)) return fail("invalid", `Mock ${i + 1}: the URL must be one line of text.`);
  if (!Number.isInteger(m.status) || m.status < 100 || m.status > 599) return fail("invalid", `Mock ${i + 1}: the status must be 100 to 599.`);
  const json = jsonOf(m.body);
  return typeof json === "string" ? null : json;
}

/** Plans adding Scenario `op.name` whose `http` list answers with `op.mocks`. */
export function planAddMockScene(text: string, op: AddMockScene): Plan {
  if (!Array.isArray(op.mocks) || op.mocks.length === 0) return fail("invalid", "There are no responses to write: record some first.");
  if (op.mocks.length > 100) return fail("invalid", "At most 100 mocks are written at once.");
  for (const [i, m] of op.mocks.entries()) {
    const bad = checkMock(m, i);
    if (bad) return bad;
  }
  const description = (op.description ?? "").trim();
  if (/[\n\r`]/.test(description) || description.includes("${")) return fail("invalid", "The description must be one line of plain text.");
  const url = (op.url ?? "").trim();
  if (url && (!url.startsWith("/") || /[\s`]/.test(url))) return fail("invalid", "The Scenario's URL is a path of the app, such as /users.");

  const planned = planScene(text, { op: "addScene", file: op.file, name: op.name });
  if ("ok" in planned) return planned;
  const hunk = planned.hunks[0]!;
  const at = hunk.text.lastIndexOf(": {}");
  if (at < 0) return fail("invalid", "The new scene could not be placed.");
  const sf = parse(text);
  const quote = quoteOf(sf);
  const unit = unitOf(text);
  // The indent of the line the new scene's key is on.
  const nl = hunk.text.lastIndexOf("\n", at);
  const indent = nl >= 0 ? /^[ \t]*/.exec(hunk.text.slice(nl + 1))![0] : indentOf(text, hunk.start);
  const i1 = indent + unit;
  const i2 = i1 + unit;
  const lines = ["{"];
  if (description) lines.push(`${i1}description: ${str(description, quote)},`);
  if (url) lines.push(`${i1}url: ${str(url, quote)},`);
  lines.push(`${i1}http: [`);
  for (const m of op.mocks) lines.push(`${i2}{ method: ${str(m.method, quote)}, url: ${str(m.url, quote)}, reply: { status: ${m.status}, body: ${render(m.body ?? null, i2, unit)} } },`);
  lines.push(`${i1}],`, `${indent}}`);
  const value = lines.join("\n");
  const n = op.mocks.length;
  return {
    hunks: [{ ...hunk, text: hunk.text.slice(0, at + 2) + value + hunk.text.slice(at + 4) }],
    label: `Add Scenario "${op.name.trim()}" (${n} recorded response${n === 1 ? "" : "s"})`,
  };
}

interface Located {
  sf: ts.SourceFile;
  list: ts.ArrayLiteralExpression;
  el: ts.Expression;
}

function locate(text: string, scene: string, index: number, expectUrl: string | undefined): Located | EditError {
  const sf = parse(text);
  const scenes = scenesObject(sf);
  if ("ok" in scenes) return scenes;
  const prop = scenes.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && keyOf(p.name) === scene);
  if (!prop) return fail("stale", `There is no Scenario "${scene}" any more.`);
  const obj = unwrap(prop.initializer);
  if (!ts.isObjectLiteralExpression(obj)) return fail("readonly", `Scenario "${scene}" is computed, so its mocks are not edited here.`);
  const http = propOf(obj, "http");
  const list = http && unwrap(http.initializer);
  if (!list || !ts.isArrayLiteralExpression(list)) return fail(http ? "readonly" : "missing", http ? "The scene's `http` is computed." : `Scenario "${scene}" has no mocks.`);
  const el = list.elements[index];
  if (!Number.isInteger(index) || !el) return fail("stale", `Scenario "${scene}" has no mock ${index + 1} any more.`);
  if (expectUrl !== undefined && mockInfo(sf, el, index).url !== expectUrl) return fail("stale", `Mock ${index + 1} of "${scene}" is not ${expectUrl} any more; the file changed.`);
  return { sf, list, el };
}

/** Plans changing one mock's reply: each field given is set (a value) or removed (null); the others stay as written. */
export function planSetMock(text: string, op: SetMock): Plan {
  const found = locate(text, op.scene, op.index, op.expectUrl);
  if ("ok" in found) return found;
  const { sf, el } = found;
  const mock = unwrap(el);
  const reply = ts.isObjectLiteralExpression(mock) ? propOf(mock, "reply") : undefined;
  const obj = reply && unwrap(reply.initializer);
  if (!obj || !ts.isObjectLiteralExpression(obj)) return fail("readonly", "The reply is computed (a function of the request), so it is not edited here.");
  if (obj.properties.some((p) => !ts.isPropertyAssignment(p))) return fail("readonly", "The reply has a spread or a method, so it is not edited here.");

  const patch: MockReplyPatch = op.reply ?? {};
  const quote = quoteOf(sf);
  const unit = unitOf(text);
  const values = new Map<string, string | null>();
  if ("status" in patch && patch.status !== undefined) {
    if (patch.status !== null && (!Number.isInteger(patch.status) || patch.status < 100 || patch.status > 599)) return fail("invalid", "The status must be 100 to 599.");
    values.set("status", patch.status === null ? null : String(patch.status));
  }
  if ("delay" in patch && patch.delay !== undefined) {
    if (patch.delay !== null && (!Number.isInteger(patch.delay) || patch.delay < 0 || patch.delay > 60000)) return fail("invalid", "The delay is 0 to 60000 ms.");
    values.set("delay", patch.delay === null || patch.delay === 0 ? null : String(patch.delay));
  }
  if ("error" in patch && patch.error !== undefined) {
    if (patch.error !== null && patch.error !== "network" && patch.error !== "abort") return fail("invalid", 'The error is "network" or "abort".');
    values.set("error", patch.error === null ? null : str(patch.error, quote));
  }
  if ("body" in patch && patch.body !== undefined) {
    const json = jsonOf(patch.body);
    if (typeof json !== "string") return json;
    values.set("body", patch.body === null ? null : json);
  }
  if (values.size === 0) return fail("nothing", "Nothing to change.");

  const props = obj.properties as ts.NodeArray<ts.PropertyAssignment>;
  const multiline = props.length > 0 ? text.slice(obj.getStart(sf), props[0]!.getStart(sf)).includes("\n") : false;
  const indent = props.length > 0 ? indentOf(text, props[0]!.getStart(sf)) : indentOf(text, obj.getStart(sf)) + unit;
  const valueText = (k: string, v: string) => (k === "body" ? render(JSON.parse(v), indent, unit) : v);

  const hunks: Hunk[] = [];
  const removed = new Set<number>();
  const inserts: string[] = [];
  for (const [k, v] of values) {
    const i = props.findIndex((p) => keyOf(p.name) === k);
    if (i >= 0 && v === null) removed.add(i);
    else if (i >= 0) hunks.push({ start: props[i]!.initializer.getStart(sf), end: props[i]!.initializer.end, text: valueText(k, v!) });
    else if (v !== null) inserts.push(`${k}: ${valueText(k, v)}`);
  }
  if (removed.size === 0 && inserts.length === 0 && hunks.length === 0) return fail("nothing", "Nothing to change.");

  if (props.length === 0) {
    if (inserts.length) hunks.push({ start: obj.getStart(sf), end: obj.end, text: `{ ${inserts.join(", ")} }` });
  } else {
    const sep = multiline ? `,\n${indent}` : ", ";
    const trailing = props.hasTrailingComma;
    let endTaken = false;
    // Removed properties in runs of neighbours, so the ranges tile without overlapping.
    for (let i = 0; i < props.length; i++) {
      if (!removed.has(i)) continue;
      let j = i;
      while (removed.has(j + 1)) j++;
      const last = j === props.length - 1;
      if (!last) hunks.push({ start: props[i]!.getStart(sf), end: props[j + 1]!.getStart(sf), text: "" });
      else if (i > 0) {
        endTaken = true;
        hunks.push({ start: props[i - 1]!.end, end: props[j]!.end, text: inserts.length ? sep + inserts.join(sep) : "" });
      } else {
        // Every property goes (none is replaced then), so the object is rewritten whole.
        endTaken = true;
        hunks.push({ start: obj.getStart(sf), end: obj.end, text: inserts.length ? `{ ${inserts.join(", ")} }` : "{}" });
      }
      i = j;
    }
    if (inserts.length && !endTaken) {
      const lastProp = props[props.length - 1]!;
      const at = trailing ? text.indexOf(",", lastProp.end) + 1 : lastProp.end;
      const body = inserts.join(sep);
      hunks.push({ start: at, end: at, text: trailing ? (multiline ? `\n${indent}${inserts.join(`,\n${indent}`)},` : ` ${body},`) : sep + body });
    }
  }
  const info = mockInfo(sf, el, op.index);
  return { hunks, label: `Edit mock ${info.method ?? ""} ${info.url}`.replace(/ +/g, " ") };
}

/** Plans removing one mock from a scene's `http` list (with its comma). */
export function planRemoveMock(text: string, op: RemoveMock): Plan {
  const found = locate(text, op.scene, op.index, op.expectUrl);
  if ("ok" in found) return found;
  const { sf, list, el } = found;
  const els = list.elements;
  const i = op.index;
  const info = mockInfo(sf, el, i);
  const label = `Remove mock ${info.method ?? ""} ${info.url}`.replace(/ +/g, " ");
  if (i < els.length - 1) return { hunks: [{ start: el.getStart(sf), end: els[i + 1]!.getStart(sf), text: "" }], label };
  if (i > 0) return { hunks: [{ start: els[i - 1]!.end, end: el.end, text: "" }], label };
  return { hunks: [{ start: list.getStart(sf), end: list.end, text: "[]" }], label };
}

export function planMocks(text: string, op: MockOp): Plan {
  if (op.op === "addMockScene") return planAddMockScene(text, op);
  if (op.op === "setMock") return planSetMock(text, op);
  return planRemoveMock(text, op);
}
