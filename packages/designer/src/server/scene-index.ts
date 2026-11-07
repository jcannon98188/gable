// A static read of the `*.scenes.ts` files: which scenes each one has, and what they carry. The Designer needs this for
// files that are not mounted (page mode offers every scene of every file as a Scenario, and only one is loaded at a time).
// It reads the source; nothing is executed, so a scene built by a function call shows up with what can be seen of it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "@typescript/typescript6";
import { findScenes } from "./backend.js";

export interface SceneEntry {
  name: string;
  description: string | null;
  /** How many HTTP mocks the scene lists, or 0. */
  mocks: number;
  /** The route the scene opens the app at in page mode, if it says. */
  url: string | null;
}

export interface SceneFileEntry {
  /** Root-relative URL, `/src/x.scenes.ts`. */
  file: string;
  component: string | null;
  scenes: SceneEntry[];
}

const keyOf = (n: ts.PropertyName): string | null => (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
const text = (e: ts.Expression | undefined): string | null => (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null);
const unwrap = (e: ts.Expression): ts.Expression => (ts.isSatisfiesExpression(e) || ts.isAsExpression(e) || ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);

export function readSceneFile(file: string, source: string): SceneFileEntry {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: SceneFileEntry = { file, component: null, scenes: [] };
  const exported = sf.statements.find(ts.isExportAssignment);
  let def: ts.Expression | undefined = exported && unwrap(exported.expression);
  if (def && ts.isIdentifier(def)) {
    const name = def.text;
    def = undefined;
    for (const st of sf.statements) if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) def = unwrap(d.initializer);
  }
  if (!def || !ts.isObjectLiteralExpression(def)) return out;
  for (const p of def.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = keyOf(p.name);
    if (key === "component") out.component = p.initializer.getText();
    if (key !== "scenes" || !ts.isObjectLiteralExpression(unwrap(p.initializer))) continue;
    for (const s of (unwrap(p.initializer) as ts.ObjectLiteralExpression).properties) {
      if (!ts.isPropertyAssignment(s)) continue;
      const name = keyOf(s.name);
      const body = unwrap(s.initializer);
      if (name === null) continue;
      const entry: SceneEntry = { name, description: null, mocks: 0, url: null };
      if (ts.isObjectLiteralExpression(body)) {
        for (const f of body.properties) {
          if (!ts.isPropertyAssignment(f)) continue;
          const k = keyOf(f.name);
          const v = unwrap(f.initializer);
          if (k === "description") entry.description = text(v);
          else if (k === "url") entry.url = text(v);
          else if (k === "http") entry.mocks = ts.isArrayLiteralExpression(v) ? v.elements.length : 1;
        }
      }
      out.scenes.push(entry);
    }
  }
  return out;
}

export function sceneIndex(root: string): SceneFileEntry[] {
  return findScenes(root).map((file) => readSceneFile(file, readFileSync(join(root, file), "utf8")));
}
