// Scene templates (TASK-104.7, TASK-105.7). A template is typed against the Pixi element map
// when it is a renderer boundary's own template (`meta.renderer`), when it carries the marker
// (`meta.elements: pixiElements`) or when it is projected into a boundary component. Everything
// else keeps the DOM map. The map itself is `buildElementMap()` from `@gable/renderer-pixi/elements`:
// one table, no copy here.

import ts from "@typescript/typescript6";
import {
  buildElementMap,
  convertStaticAttribute,
  isSceneTag,
  isSceneEvent,
  isShapeTag,
  propertiesOf,
  resolveProperty,
  SCENE_EVENTS,
  type SceneTagName,
  type ShapeTagName,
} from "@gable/renderer-pixi/elements";
import type { RuleId } from "./config.js";
import type { TemplateModel } from "./emit.js";
import type { ElementNode, TNode } from "./scan.js";
import { closest } from "./typeutil.js";

type Report = (start: number, length: number, rule: RuleId, message: string) => void;

const elementMap = buildElementMap();
const pixi = (type: string): string => type.replace(/\b[A-Z]\w*/g, (name) => `import("pixi.js").${name}`);

/** Tag names that are also real DOM (SVG) elements, so a DOM template may use them. */
const DOM_NAMES = new Set(["text", "rect", "circle", "ellipse", "polygon"]);

/** The scene vocabulary that can only be a mistake in a DOM template. */
export const isSceneOnlyTag = (tag: string): boolean => (isSceneTag(tag) || isShapeTag(tag) || tag === "rounded-rect") && !DOM_NAMES.has(tag);

/** Whether a component's `static meta` object makes its template a scene template: a boundary or the marker. */
export function metaIsScene(meta: ts.ObjectLiteralExpression): boolean {
  return meta.properties.some((p) => {
    if (!p.name || !ts.isIdentifier(p.name)) return false;
    if (p.name.text === "renderer") return true;
    if (p.name.text !== "elements") return false;
    const text = ts.isPropertyAssignment(p) ? p.initializer.getText() : p.name.text;
    return /pixielements/i.test(text);
  });
}

/** Whether a component's `static meta` declares a renderer boundary. */
export const metaIsBoundary = (meta: ts.ObjectLiteralExpression): boolean => meta.properties.some((p) => !!p.name && ts.isIdentifier(p.name) && p.name.text === "renderer");

/** The mode of an element's children: a boundary component projects the scene map into them. */
export const childScene = (node: ElementNode, scene: boolean, isBoundary: (tag: string) => boolean): boolean => scene || isBoundary(node.tag);

/** Visits every element with the mode (scene or DOM) its own tag is typed in. */
export function walkMode(tree: readonly TNode[], scene: boolean, isBoundary: (tag: string) => boolean, visit: (el: ElementNode, scene: boolean) => void): void {
  for (const node of tree) {
    switch (node.type) {
      case "element":
        visit(node, scene);
        walkMode(node.children, childScene(node, scene, isBoundary), isBoundary, visit);
        break;
      case "if":
        for (const b of node.branches) walkMode(b.children, scene, isBoundary, visit);
        break;
      case "for":
        walkMode(node.children, scene, isBoundary, visit);
        if (node.empty) walkMode(node.empty, scene, isBoundary, visit);
        break;
      case "switch":
        for (const c of node.cases) walkMode(c.children, scene, isBoundary, visit);
        break;
      case "defer":
        walkMode(node.children, scene, isBoundary, visit);
        for (const section of [node.placeholder, node.loading, node.error]) if (section) walkMode(section, scene, isBoundary, visit);
        break;
    }
  }
}

/** Known scene tag (scene or shape), as a name the map and table both use. */
export const knownSceneTag = (tag: string): tag is SceneTagName | ShapeTagName => isSceneTag(tag) || isShapeTag(tag);

/** The TypeScript type a binding to `name` on `tag` must have, or undefined when the property is not valid there. */
export function scenePropType(tag: string, name: string): string | undefined {
  if (!knownSceneTag(tag)) return undefined;
  const spec = resolveProperty(tag, name);
  if (!spec) return undefined;
  return name.includes(".") ? "number" : pixi(elementMap[tag].props[name]!);
}

/** The TS declarations the type-check blocks need to type scene elements: node classes and event types per name. */
export function sceneDeclarations(): string {
  const nodes = Object.entries(elementMap).map(([tag, entry]) => `${JSON.stringify(tag)}: ${pixi(entry.node)};`);
  const events = Object.entries(SCENE_EVENTS).map(([name, type]) => `${name}: ${pixi(type)};`);
  return `declare function __sv<T>(v: T): void;
type __ScNodes = { ${nodes.join(" ")} };\ntype __ScEvMap = { ${events.join(" ")} };\ntype __ScEl<T extends string> = T extends keyof __ScNodes ? __ScNodes[T] : import("pixi.js").Container;\ntype __SEv<C, N extends string> = N extends keyof C ? __Out<C[N]> : N extends keyof __ScEvMap ? __ScEvMap[N] : any;\n`;
}

const dottedHint = "dotted paths address one axis of a point-like property: position, scale, pivot, skew, anchor (.x or .y)";

function unknownProperty(tag: string, name: string): string {
  if (/^(style|attr|class)\./.test(name)) return `Unknown property "${name}" on <${tag}>: Pixi nodes have no CSS styles, attributes or classes; ${name.startsWith("style.") ? "write TextStyle fields flat (fontSize, fill) or bind [style]" : "bind the Pixi property directly"}`;
  if (name.includes(".")) return `Unknown property "${name}" on <${tag}>: ${dottedHint}`;
  const hint = closest(name, Object.keys(propertiesOf(tag as SceneTagName)));
  return `Unknown property "${name}" on <${tag}>${hint ? `. Did you mean "${hint}"?` : ""}`;
}

/** Tag, property, static-attribute and DOM-leak rules for one template. Event names and value types go through the type-check blocks. */
export function sceneRules(model: TemplateModel, isComponent: (tag: string) => boolean, isBoundary: (tag: string) => boolean, report: Report): void {
  const tags = [...Object.keys(elementMap)];
  walkMode(model.tree, model.scene, isBoundary, (el, scene) => {
    if (!scene) {
      if (isSceneOnlyTag(el.tag) && !isComponent(el.tag)) {
        report(el.tagStart, el.tag.length, "scene-tag-in-dom", `<${el.tag}> is a Pixi scene tag, but this template is a DOM template. Declare a renderer boundary (meta.renderer), mark the component with elements: pixiElements, or use it inside a canvas component`);
      }
      return;
    }
    if (isComponent(el.tag)) return;
    if (!knownSceneTag(el.tag)) {
      const hint = closest(el.tag, tags);
      report(el.tagStart, el.tag.length, "scene-unknown-tag", `Unknown scene tag <${el.tag}>${hint ? `. Did you mean "${hint}"?` : ""} (a Pixi scene template takes Pixi tags and components)`);
      return;
    }
    const tag = el.tag;
    for (const e of el.expressions) {
      if (e.kind === "handler") continue;
      if (e.kind === "field") continue;
      if (!resolveProperty(tag, e.name)) report(e.nameStart, e.name.length, "scene-unknown-property", unknownProperty(tag, e.name));
    }
    // scene-pointer-a11y: a pointer listener makes the node interactive, so assistive technology needs [a11y] (TASK-104.11).
    const pointer = el.expressions.find((e) => e.kind === "handler" && isSceneEvent(e.name) && e.name !== "wheel");
    const hasA11y = el.attrs.some((a) => a.name === "a11y") || el.expressions.some((e) => e.kind === "value" && e.name === "a11y");
    if (pointer && !hasA11y) {
      report(el.tagStart, el.tag.length, "scene-pointer-a11y", `<${tag}> listens for pointer events ((${pointer.name})) but has no [a11y]: add [a11y]="{ role, label }" so keyboard and assistive technology users can reach it, or give the action a non-pointer route`);
    }
    for (const a of el.attrs) {
      const spec = resolveProperty(tag, a.name);
      if (!spec) {
        report(a.nameStart, a.name.length, "scene-unknown-property", unknownProperty(tag, a.name));
        continue;
      }
      const converted = convertStaticAttribute(spec, a.value ?? "");
      if (!converted.ok) report(a.nameStart, a.name.length + (a.value === undefined ? 0 : a.value.length + 3), "scene-attribute", `Attribute "${a.name}" on <${tag}>: ${converted.message}`);
    }
  });
}

/** Names the editor offers: scene tags, the properties of a tag (dotted axes included) and event names. */
export function sceneTagNames(): string[] {
  return Object.keys(elementMap);
}

export function scenePropertyNames(tag: string): string[] {
  if (!knownSceneTag(tag)) return [];
  const props = propertiesOf(tag);
  const names = Object.keys(props);
  for (const name of Object.keys(props)) if (props[name]!.kind === "point") names.push(`${name}.x`, `${name}.y`);
  return names;
}

export const sceneEventNames = (): string[] => Object.keys(SCENE_EVENTS);

// --- completions ------------------------------------------------------------------

const VOID_OR_SELF = /\/\s*$/;

/** The component classes the completions need to know: selectors, and which of them are renderer boundaries. */
export interface SceneComponents {
  selectors: readonly string[];
  boundaries: ReadonlySet<string>;
}

/**
 * Completions at `offset` of `text` when the cursor is in a tag name or attribute name of a scene template: the
 * scene tags and the project's components after `<`, the tag's properties (`[`, a plain attribute) with the x and y
 * axes of point-like ones, and the scene events inside `( )`. Lexical on purpose: a half-typed tag does not scan.
 */
export function sceneCompletions(text: string, offset: number, templateTag: string, components: SceneComponents): ts.WithMetadata<ts.CompletionInfo> | undefined {
  const sf = ts.createSourceFile("template.ts", text, ts.ScriptTarget.Latest, true);
  let literal: ts.TaggedTemplateExpression | undefined;
  let meta: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (literal || offset < node.pos || offset > node.end) return;
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === templateTag && offset > node.template.getStart(sf) && offset < node.template.end) {
      literal = node;
      for (let up: ts.Node | undefined = node; up; up = up.parent) {
        if (ts.isObjectLiteralExpression(up) && up.parent && ts.isPropertyDeclaration(up.parent)) meta = up;
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!literal) return undefined;
  const body = text.slice(literal.template.getStart(sf) + 1, offset);

  // Walk the tags before the cursor: the open-element stack tells whether a boundary projects the scene map here.
  const stack: string[] = [];
  let open: { name: string; attrs: string; nameStart: number } | undefined;
  const base = literal.template.getStart(sf) + 1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "<") continue;
    const close = /^<\/([A-Za-z][\w-]*)/.exec(body.slice(i));
    if (close) {
      stack.pop();
      i += close[0].length;
      continue;
    }
    const tag = /^<([A-Za-z][\w-]*|)/.exec(body.slice(i))!;
    let j = i + tag[0].length;
    let quote = "";
    for (; j < body.length; j++) {
      const c = body[j]!;
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (j >= body.length) {
      open = { name: tag[1]!, attrs: body.slice(i + tag[0].length), nameStart: base + i + 1 };
      break;
    }
    if (tag[1] && !VOID_OR_SELF.test(body.slice(i, j)) && !VOID_TAGS.has(tag[1])) stack.push(tag[1]);
    i = j;
  }
  if (!open) return undefined;

  const scene = (meta ? metaIsScene(meta) : false) || stack.some((t) => components.boundaries.has(t));
  if (!scene) return undefined;

  const info = (names: Array<{ name: string; kind: ts.ScriptElementKind }>, from: number): ts.WithMetadata<ts.CompletionInfo> => ({
    isGlobalCompletion: false,
    isMemberCompletion: false,
    isNewIdentifierLocation: false,
    optionalReplacementSpan: { start: from, length: offset - from },
    entries: names.map((n, i) => ({ ...n, kindModifiers: "", sortText: String(i).padStart(4, "0"), replacementSpan: { start: from, length: offset - from } })),
  });

  // In the tag name.
  if (open.attrs === "") {
    return info(
      [...sceneTagNames().map((name) => ({ name, kind: ts.ScriptElementKind.classElement })), ...components.selectors.map((name) => ({ name, kind: ts.ScriptElementKind.classElement }))],
      open.nameStart,
    );
  }
  // In an attribute name: the token after the last whitespace, outside any quoted value.
  const attrs = open.attrs;
  if (!/\s/.test(attrs)) return undefined;
  const quotes = (attrs.match(/["']/g) ?? []).length;
  if (quotes % 2 === 1) return undefined;
  const tokenAt = attrs.search(/\S*$/);
  const token = attrs.slice(tokenAt);
  if (token.includes("=")) return undefined;
  if (!knownSceneTag(open.name)) return undefined;
  const tokenStart = offset - token.length;
  if (token.startsWith("(")) return info(sceneEventNames().map((name) => ({ name, kind: ts.ScriptElementKind.memberFunctionElement })), tokenStart + 1);
  const from = token.startsWith("[") ? tokenStart + 1 : tokenStart;
  return info(scenePropertyNames(open.name).map((name) => ({ name, kind: ts.ScriptElementKind.memberVariableElement })), from);
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
