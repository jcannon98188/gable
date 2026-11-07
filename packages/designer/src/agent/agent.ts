// The Preview agent. Dev only: the Designer's Vite plugin injects it into the previewed app, and it stays dormant unless
// the page was opened by the Designer (the shell names the iframe, see `protocol.ts`). It owns no framework logic: it rides
// on the two dev hooks of @gable/core (devtools for state, designer for template nodes) and adds picking, overlays and the
// postMessage transport.
import type { DevtoolsEvent, GableDevtoolsHook } from "@gable/core/devtools";
import type { DesignerHook, DesignNode } from "@gable/core/designer";
import {
  PROTOCOL_VERSION,
  envelope,
  isOurs,
  takeSession,
  type AgentMessage,
  type AgentMethods,
  type CanvasDiagnostic,
  type Request,
  type SceneInfo,
} from "../protocol.js";

interface SceneHost {
  module: string;
  component: string;
  scenes: Array<{ name: string; description?: string }>;
  current: string;
  mount(name: string): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __GABLE_SCENES__: SceneHost | undefined;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const session = typeof window !== "undefined" && parent !== window ? takeSession(location, history, sessionStorage) : null;
if (session) start(session);

function start({ nonce, shellOrigin }: { nonce: string; shellOrigin: string }): void {
  let devtools: GableDevtoolsHook | undefined;
  const hook: DesignerHook | undefined = globalThis.__GABLE_DESIGNER_HOOK__;
  if (!hook) return console.warn("[gable-designer] installDesigner() did not run before the agent; the preview is not inspectable.");
  const designer: DesignerHook = hook;
  let mode: "select" | "interact" = "select";
  let selected: string | null = null;
  let hovered: string | null = null;
  let diagnostics: CanvasDiagnostic[] = [];

  const send = (message: DistributiveOmit<AgentMessage, "channel" | "v" | "nonce">) => parent.postMessage({ ...envelope(nonce), ...message }, shellOrigin);

  // --- overlay ------------------------------------------------------------

  const layer = document.createElement("div");
  layer.setAttribute("data-gable-designer", "");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden";
  const boxes = new Map<string, HTMLElement>();
  let queued = false;
  const redraw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  };

  const rectsOf = (id: string | null): DOMRect[] =>
    id ? (designer.elementsOf(id) as Element[]).filter((el) => el.isConnected).map((el) => el.getBoundingClientRect()) : [];

  function box(key: string, rect: DOMRect, style: string, label?: string, onClick?: () => void): void {
    let el = boxes.get(key);
    if (!el) {
      el = document.createElement("div");
      boxes.set(key, el);
      layer.append(el);
    }
    el.style.cssText = `position:fixed;box-sizing:border-box;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;${style}`;
    el.textContent = label ?? "";
    el.onclick = onClick ?? null;
    el.dataset.used = "1";
  }

  function draw(): void {
    for (const el of boxes.values()) delete el.dataset.used;
    if (hovered && hovered !== selected) rectsOf(hovered).forEach((r, i) => box(`h${i}`, r, "border:1px solid #3b82f6;background:#3b82f61a"));
    rectsOf(selected).forEach((r, i) => box(`s${i}`, r, "border:2px solid #e0457b;background:#e0457b1f"));
    const byNode = new Map<string, CanvasDiagnostic[]>();
    for (const d of diagnostics) {
      const node = designer.nodeAt(d.raw, d.offset);
      if (node) byNode.set(node.id, [...(byNode.get(node.id) ?? []), d]);
    }
    for (const [id, items] of byNode) {
      const error = items.some((d) => d.severity === "error");
      const color = error ? "#dc2626" : "#d97706";
      rectsOf(id).forEach((r, i) => {
        box(`d${id}:${i}`, r, `border:2px dashed ${color}`);
        box(`b${id}:${i}`, new DOMRect(r.right - 20, r.top - 9, 18, 18), `background:${color};color:#fff;border-radius:9px;font:700 11px/18px system-ui;text-align:center;pointer-events:auto;cursor:pointer`, String(items.length), () => send({ type: "badge", id: items[0]!.id }));
      });
    }
    for (const [key, el] of boxes) if (!el.dataset.used) (el.remove(), boxes.delete(key));
  }

  const place = (): { placed: number; unplaced: number } => {
    let placed = 0;
    for (const d of diagnostics) if (designer.nodeAt(d.raw, d.offset)) placed++;
    return { placed, unplaced: diagnostics.length - placed };
  };

  // --- picking ------------------------------------------------------------

  const chainOf = (target: Element): DesignNode[] => {
    const chain: DesignNode[] = [];
    let el: Element | null = target;
    while (el) {
      const node = designer.nodeOf(el);
      if (!node || chain.some((c) => c.id === node.id)) break;
      chain.push(node);
      const own: Element = (designer.elementsOf(node.id) as Element[]).find((x) => x.contains(el)) ?? el;
      el = own.parentElement;
    }
    return chain;
  };

  function select(id: string | null, target?: Element): void {
    selected = id;
    const chain = target ? chainOf(target) : id ? chainOf((designer.elementsOf(id)[0] as Element | undefined) ?? document.body) : [];
    const node = chain.find((n) => n.id === id) ?? null;
    const owner = node?.component && devtools ? (devtools.call("component", { id: node.component.id }) as AgentMethods["component"]["result"]) : null;
    send({ type: "pick", node, chain, component: owner });
    redraw();
  }

  // Events that would act on the page (follow a link, submit, start a drag) are cancelled in select mode. The app's own
  // handlers never run either: they are muted at the Renderer's `listen` (see `muted`); stopping propagation here is a
  // second line for listeners that bypass the Renderer (window-level or library listeners).
  for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "auxclick", "contextmenu", "submit", "dragstart"]) {
    document.addEventListener(
      type,
      (e) => {
        if (mode !== "select") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (type === "click") select(designer.nodeOf(e.target)?.id ?? null, e.target as Element);
      },
      true,
    );
  }
  document.addEventListener(
    "mouseover",
    (e) => {
      if (mode !== "select") return;
      hovered = designer.nodeOf(e.target)?.id ?? null;
      redraw();
    },
    true,
  );
  document.addEventListener("mouseleave", () => ((hovered = null), redraw()));
  addEventListener("scroll", redraw, true);
  addEventListener("resize", redraw);

  // --- the shell's requests -----------------------------------------------

  const handlers: { [M in keyof AgentMethods]?: (p: AgentMethods[M]["params"]) => AgentMethods[M]["result"] | Promise<AgentMethods[M]["result"]> } = {
    setMode: ({ mode: next }) => {
      mode = next;
      designer.muted = next === "select";
      if (next === "interact") hovered = null;
      redraw();
      return true;
    },
    selectNode: ({ id }) => (select(id), true),
    hoverNode: ({ id }) => ((hovered = id), redraw(), true),
    nodeAt: ({ raw, offset }) => designer.nodeAt(raw, offset),
    setDiagnostics: ({ items }) => ((diagnostics = items), redraw(), place()),
    scenes: () => sceneInfo(),
    mountScene: ({ name }) => {
      if (!globalThis.__GABLE_SCENES__) throw new Error("This page is not a component-mode host.");
      globalThis.__GABLE_SCENES__.mount(name);
      return true;
    },
  };

  const sceneInfo = (): SceneInfo | null => {
    const s = globalThis.__GABLE_SCENES__;
    return s ? { module: s.module, component: s.component, current: s.current, scenes: s.scenes } : null;
  };

  async function onCall(request: Request): Promise<void> {
    const handler = handlers[request.method] as ((p: unknown) => unknown) | undefined;
    try {
      let result: unknown;
      if (handler) result = await handler(request.params);
      else if (devtools) result = await devtools.call(request.method as never, request.params as never);
      else throw new Error("The devtools hook is not installed in this page.");
      send({ type: "response", id: request.id, ok: true, result });
    } catch (error) {
      send({ type: "response", id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  addEventListener("message", (e) => {
    // Only the window that framed us, from the origin it told us, in the session it named.
    if (e.source !== parent || e.origin !== shellOrigin || !isOurs(e.data, nonce)) return;
    const m = e.data as { type: string; v: number };
    if (m.v !== PROTOCOL_VERSION) return send({ type: "incompatible", agent: PROTOCOL_VERSION, shell: m.v });
    // Before the app has installed its devtools hook there is nothing to report; `connect` announces when it does.
    if (m.type === "hello") devtools && announce();
    else if (m.type === "call") void onCall(e.data as unknown as Request);
  });

  // --- startup ------------------------------------------------------------

  const announce = () => {
    const hello = devtools?.call("hello", undefined) as AgentMethods["hello"]["result"] | undefined;
    send({ type: "ready", protocol: PROTOCOL_VERSION, root: hello?.root ?? null, location: location.href, mode: globalThis.__GABLE_SCENES__ ? "component" : "page" });
    send({ type: "scenes", scenes: sceneInfo() });
  };

  const forward = (event: DevtoolsEvent) => {
    // A flush carries every effect run; the shell only needs to know that signal values may have changed.
    send({ type: "event", event: event.type === "flush" ? { type: "flush", flush: { ...event.flush, runs: [], more: 0 } } : event });
    if (event.type === "tree" || event.type === "hmr") redraw();
  };

  const connect = (hook: GableDevtoolsHook) => {
    devtools = hook;
    hook.connect(forward);
    announce();
  };
  designer.muted = true;
  document.documentElement.append(layer);
  addEventListener("gable:scenes-ready", () => send({ type: "scenes", scenes: sceneInfo() }));
  if (globalThis.__GABLE_DEVTOOLS_HOOK__) connect(globalThis.__GABLE_DEVTOOLS_HOOK__);
  else addEventListener("gable:devtools-ready", () => connect(globalThis.__GABLE_DEVTOOLS_HOOK__!), { once: true });
}
