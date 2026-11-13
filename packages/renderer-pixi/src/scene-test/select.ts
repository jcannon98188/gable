// A small selector language over scene nodes: `tag`, `#label`, `[prop]`, `[prop=value]`, compounds of those
// (`sprite#ship`, `container[visible=false]`), and the descendant (space) and child (`>`) combinators.
import type { SceneNode } from "./node.js";

interface Compound {
  tag?: string;
  label?: string;
  attrs: Array<[string, string | undefined]>;
  combinator: " " | ">";
}

function parse(selector: string): Compound[] {
  const steps: Compound[] = [];
  const re = /\s*(>)?\s*((?:[\w*-]+|#[\w-]+|\[[^\]]+\])+)/gy;
  const text = selector.trim();
  let m: RegExpExecArray | null;
  let end = 0;
  while ((m = re.exec(text))) {
    end = re.lastIndex;
    const c: Compound = { attrs: [], combinator: m[1] ? ">" : " " };
    for (const part of m[2]!.matchAll(/(#?)([\w*-]+)|\[([\w.-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g)) {
      if (part[3] !== undefined) c.attrs.push([part[3], part[4] ?? part[5] ?? part[6]]);
      else if (part[1] === "#") c.label = part[2]!;
      else if (part[2] !== "*") c.tag = part[2]!;
    }
    steps.push(c);
  }
  if (steps.length === 0 || end !== text.length) throw new Error(`Unsupported scene selector "${selector}". Use tag, #label, [prop=value] and the descendant and > combinators.`);
  return steps;
}

function matches(node: SceneNode, c: Compound): boolean {
  if (node.kind !== "node") return false;
  if (c.tag && node.tag !== c.tag) return false;
  if (c.label !== undefined && node.label !== c.label) return false;
  return c.attrs.every(([name, value]) => {
    const actual = node.rawProperty(name);
    if (value === undefined) return actual !== undefined && actual !== null;
    return String(actual) === value;
  });
}

function matchesFrom(node: SceneNode, steps: Compound[], i: number): boolean {
  if (!matches(node, steps[i]!)) return false;
  if (i === 0) return true;
  if (steps[i]!.combinator === ">") return node.parent !== null && matchesFrom(node.parent, steps, i - 1);
  for (let p = node.parent; p; p = p.parent) if (matchesFrom(p, steps, i - 1)) return true;
  return false;
}

/** Every node under `root` matching `selector`, in tree order (depth first, insertion order). With no selector, every node. */
export function findAll(root: SceneNode, selector?: string): SceneNode[] {
  const steps = selector === undefined ? null : parse(selector);
  const out: SceneNode[] = [];
  const walk = (node: SceneNode) => {
    for (const child of node.children) {
      if (child.kind === "node" && (!steps || matchesFrom(child, steps, steps.length - 1))) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}
