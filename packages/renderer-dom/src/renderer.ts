import { History, Location, Title, type Renderer } from "@gable/core/renderer";
import { controlBinding } from "./controls.js";
import { DEV } from "./dev.js";
import { createDomPlatform, type PlatformOptions } from "./platform.js";
import { scopeCss } from "./scope-css.js";
import { isKnownTag, type Namespace } from "./tags.js";
import { DOM_TRIGGERS, observeDomTrigger } from "./triggers.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

export interface DomRenderer extends Renderer<Node> {
  readonly name: "dom";
  readonly triggers: readonly string[];
}

export interface DomRendererOptions extends PlatformOptions {
  /** The document to create nodes in. Defaults to the global `document`, read when first needed. */
  document?: Document;
}

/** The namespace an element of `tag` created under `parent` belongs to; `foreignObject` and `annotation-xml` switch back to HTML. */
function namespaceFor(tag: string, parent: Node | null): Namespace {
  if (tag === "svg") return "svg";
  if (tag === "math") return "mathml";
  const p = parent as Element | null;
  if (p && p.nodeType === 1) {
    if (p.namespaceURI === SVG_NS && p.localName !== "foreignObject") return "svg";
    if (p.namespaceURI === MATHML_NS && p.localName !== "annotation-xml") return "mathml";
  }
  return "html";
}

function namespaceOf(el: Element): Namespace {
  return el.namespaceURI === SVG_NS ? "svg" : el.namespaceURI === MATHML_NS ? "mathml" : "html";
}

function didYouMean(el: Element, name: string): string {
  const lower = name.toLowerCase();
  for (const key in el) if (key.toLowerCase() === lower) return ` Did you mean [${key}]?`;
  return ` To set an attribute instead, write [attr.${name}].`;
}

/** Property names go to attributes on SVG and MathML elements, where the DOM properties are mostly read-only wrappers. */
function setForeignProperty(el: Element, name: string, value: unknown): void {
  if (name === "textContent") el.textContent = String(value ?? "");
  else if (value === null || value === undefined || value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? "" : String(value));
}

const kebab = (name: string) => (name.startsWith("--") ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

/** The renderer over the browser DOM: HTML, SVG and MathML, scoped styles and the `viewport`, `interaction` and `hover` triggers. */
export function createDomRenderer(options: DomRendererOptions = {}): DomRenderer {
  const doc = () => options.document ?? document;
  const sheets = new Map<string, HTMLStyleElement>();
  // Built when first injected, so creating the renderer needs no browser globals.
  let platform: ReturnType<typeof createDomPlatform> | undefined;
  const services = () => (platform ??= createDomPlatform(options));

  return {
    name: "dom",
    triggers: DOM_TRIGGERS,
    providers: [
      { provide: Location, useFactory: () => services().location },
      { provide: History, useFactory: () => services().history },
      { provide: Title, useFactory: () => services().title },
    ],

    createElement(tag, parent) {
      const ns = namespaceFor(tag, parent);
      if (DEV && !isKnownTag(ns, tag)) {
        throw new Error(
          `Unknown element <${tag}>${ns === "html" ? "" : ` in ${ns === "svg" ? "SVG" : "MathML"} content`}. ` +
            `The DOM renderer knows the standard ${ns === "html" ? "HTML" : ns === "svg" ? "SVG" : "MathML"} tags and custom elements (names with a hyphen). ` +
            `A Gable component is used by its selector and must be listed in meta.imports.`,
        );
      }
      return ns === "html" ? doc().createElement(tag) : doc().createElementNS(ns === "svg" ? SVG_NS : MATHML_NS, tag);
    },
    createText: (text) => doc().createTextNode(text),
    createAnchor: () => doc().createComment(""),

    setProperty(node, name, value) {
      const el = node as Element;
      if (namespaceOf(el) !== "html") return setForeignProperty(el, name, value);
      if (DEV && !(name in el) && !el.localName.includes("-")) {
        throw new Error(`Unknown property "${name}" on <${el.localName}>.${didYouMean(el, name)}`);
      }
      (el as any)[name] = value;
    },
    setAttribute(node, name, value) {
      if (value === null) (node as Element).removeAttribute(name);
      else (node as Element).setAttribute(name, value);
    },
    setClass: (node, name, on) => void (node as Element).classList.toggle(name, on),
    setStyle(node, name, value) {
      const style = (node as HTMLElement).style;
      if (value === null) style.removeProperty(kebab(name));
      else style.setProperty(kebab(name), value);
    },
    setText: (node, text) => void (node.textContent = text),

    insert: (parent, node, before) => void parent.insertBefore(node, before ?? null),
    remove: (node) => (node as ChildNode).remove(),

    listen(node, name, handler) {
      let domEvent = name;
      let map: (event: Event) => unknown = (event) => event;
      const model = /^(\w+)Change$/.exec(name);
      if (model) {
        const control = node.nodeType === 1 ? controlBinding(node as Element) : null;
        if (control && control.property === model[1]) {
          domEvent = control.event;
          map = () => control.read(node as Element);
        } else map = (event) => (event instanceof CustomEvent ? event.detail : event);
      }
      const listener = (event: Event) => handler(map(event));
      node.addEventListener(domEvent, listener);
      return () => node.removeEventListener(domEvent, listener);
    },

    fieldControl(node) {
      const el = node as HTMLInputElement;
      const type = () => (el.localName === "input" ? el.type : el.localName);
      const checkable = () => type() === "checkbox" || type() === "radio";
      const numeric = () => type() === "number" || type() === "range";
      return {
        write(value) {
          if (type() === "checkbox") el.checked = !!value;
          else if (type() === "radio") el.checked = value != null && el.value === String(value);
          else if (numeric()) {
            if (value == null) el.value = "";
            else if (el.valueAsNumber !== value) el.value = String(value);
          } else {
            const text = value == null ? "" : String(value);
            if (el.value !== text) el.value = text;
          }
        },
        setState({ disabled, readonly, invalid }) {
          el.disabled = disabled;
          if (el.localName !== "select") el.readOnly = readonly;
          if (invalid) el.setAttribute("aria-invalid", "true");
          else el.removeAttribute("aria-invalid");
        },
        listen({ value, touched }) {
          const onValue = () => {
            if (type() === "radio") {
              if (el.checked) value(el.value);
            } else value(controlBinding(el)!.read(el));
          };
          const event = checkable() || el.localName === "select" ? "change" : "input";
          const onBlur = () => touched();
          el.addEventListener(event, onValue);
          el.addEventListener("blur", onBlur);
          return () => {
            el.removeEventListener(event, onValue);
            el.removeEventListener("blur", onBlur);
          };
        },
      };
    },

    registerStyles(componentId, css, { scoped = true } = {}) {
      const token = scoped ? `g-${componentId.replace(/[^\w-]/g, "_")}` : "";
      let el = sheets.get(componentId);
      if (!el || !el.isConnected) {
        el = doc().createElement("style");
        el.setAttribute("data-gable", componentId);
        doc().head.appendChild(el);
        sheets.set(componentId, el);
      }
      el.textContent = token ? scopeCss(css, token) : css;
      return token;
    },

    resolveTarget(target) {
      if (typeof target === "string") {
        const el = doc().querySelector(target);
        if (!el) throw new Error(`bootstrap target "${target}" matched no element in the document.`);
        return el;
      }
      if (typeof target === "object" && target !== null && (target as Node).nodeType === 1) return target as Element;
      throw new Error("bootstrap target must be a CSS selector or an element when using the DOM renderer.");
    },

    observeTrigger: (name, args, placeholder, fire) => observeDomTrigger(name, args, placeholder, fire),
  };
}

/** The DOM platform in one entry: the renderer plus Location, History and Title providers. Use as `bootstrap(Root, { renderer: dom(), target: '#app' })`. */
export const dom = createDomRenderer;
