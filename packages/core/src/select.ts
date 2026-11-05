import type { ElementNode } from "./template.js";

export interface Selector {
  tag?: string;
  classes: string[];
  attrs: Array<[string, string | undefined]>;
}

const cache = new Map<string, Selector>();

/** Parses a simple selector: `tag`, `.class`, `[attr]`, `[attr=value]`, combined (`button[appX].big`). */
export function parseSelector(selector: string): Selector {
  let parsed = cache.get(selector);
  if (!parsed) {
    const tagMatch = /^[A-Za-z][\w-]*/.exec(selector);
    const rest = selector.slice(tagMatch?.[0].length ?? 0);
    parsed = {
      tag: tagMatch?.[0],
      classes: [...rest.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!),
      attrs: [...rest.matchAll(/\[([\w-]+)(?:=([^\]]*))?\]/g)].map((m): [string, string | undefined] => [m[1]!, m[2]]),
    };
    cache.set(selector, parsed);
  }
  return parsed;
}

/** Whether a template element matches a selector (static attributes and bound names count). */
export function matchesNode(selector: Selector, node: ElementNode): boolean {
  if (selector.tag && selector.tag !== node.tag) return false;
  const classAttr = node.attrs.find((a) => a.name === "class")?.value.split(/\s+/) ?? [];
  if (!selector.classes.every((c) => classAttr.includes(c))) return false;
  return selector.attrs.every(([name, value]) => {
    const fixed = node.attrs.find((a) => a.name === name);
    if (fixed) return value === undefined || fixed.value === value;
    return value === undefined && (node.bindings.some((b) => b.name === name) || node.models.some((m) => m.name === name));
  });
}
