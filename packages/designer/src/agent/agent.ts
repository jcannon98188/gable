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
  windowNameStorage,
  type AgentMessage,
  type AgentMethods,
  type CanvasDiagnostic,
  type Interaction,
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
const session = typeof window !== "undefined" && parent !== window ? takeSession(location, history, windowNameStorage(window)) : null;
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

  // --- frame emulation and sync (see devices.ts) ------------------------------------

  // Where the browser cannot emulate touch itself, mouse presses become touch events (when the engine has Touch and
  // TouchEvent: Chromium and WebKitGTK do, desktop Safari does not). Media features cannot be faked from here.
  const nativeDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  let touching = false;
  let touchId = 0;
  const canTouch = typeof Touch === "function" && typeof TouchEvent === "function";
  const touchOf = (type: "touchstart" | "touchmove" | "touchend", e: MouseEvent): boolean => {
    const touch = new Touch({ identifier: touchId, target: e.target as EventTarget, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, pageX: e.pageX, pageY: e.pageY });
    const list = type === "touchend" ? [] : [touch];
    const event = new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: list, targetTouches: list, changedTouches: [touch] });
    (e.target as EventTarget).dispatchEvent(event);
    return event.defaultPrevented;
  };
  for (const [mouse, touch] of [["mousedown", "touchstart"], ["mousemove", "touchmove"], ["mouseup", "touchend"]] as const) {
    document.addEventListener(
      mouse,
      (e) => {
        if (!touching || !e.isTrusted || mode !== "interact" || (e as MouseEvent).button !== 0) return;
        if (mouse === "mousedown") (touchId++, (pressed = true));
        else if (!pressed) return;
        if (touchOf(touch, e as MouseEvent) && mouse !== "mouseup") e.preventDefault();
        if (mouse === "mouseup") pressed = false;
      },
      true,
    );
  }
  let pressed = false;

  function emulate(touch: boolean, dpr: number): boolean {
    touching = touch && canTouch;
    if (touch && canTouch) (window as { ontouchstart?: unknown }).ontouchstart ??= null;
    else delete (window as { ontouchstart?: unknown }).ontouchstart;
    if (dpr === 1 && !nativeDpr) delete (window as { devicePixelRatio?: unknown }).devicePixelRatio;
    else if (dpr !== (nativeDpr?.get?.call(window) ?? 1)) Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => dpr });
    else if (nativeDpr) Object.defineProperty(window, "devicePixelRatio", nativeDpr);
    return !touch || canTouch;
  }

  // --- Tailwind mode's temporary preview (see `setPreview` in protocol.ts) ----------------------------------------------

  let previewStyle: HTMLStyleElement | null = null;
  const previewed: Array<{ el: Element; added: string[] }> = [];
  let darkAdded = false;
  function clearPreview(): void {
    for (const { el, added } of previewed) {
      el.classList.remove(...added);
      el.removeAttribute("data-gd-forced");
      el.closest(".group")?.removeAttribute("data-gd-forced-group");
    }
    previewed.length = 0;
    previewStyle?.remove();
    previewStyle = null;
    if (darkAdded) document.documentElement.classList.remove("dark");
    darkAdded = false;
  }
  function setPreview(p: AgentMethods["setPreview"]["params"]): number {
    clearPreview();
    if (!p.id) return 0;
    const els = (designer.elementsOf(p.id) as Node[]).filter((n): n is Element => n instanceof Element && n.isConnected);
    if (p.css) {
      previewStyle = document.createElement("style");
      previewStyle.setAttribute("data-gable-designer-preview", "");
      previewStyle.textContent = p.css;
      document.head.append(previewStyle);
    }
    for (const el of els) {
      const added = p.addClasses.filter((c) => c && !el.classList.contains(c));
      el.classList.add(...added);
      previewed.push({ el, added });
      if (p.mark) {
        el.setAttribute("data-gd-forced", "");
        el.closest(".group")?.setAttribute("data-gd-forced-group", "");
      }
    }
    if (p.dark && !document.documentElement.classList.contains("dark")) (document.documentElement.classList.add("dark"), (darkAdded = true));
    return els.length;
  }

  const pathOf = (el: Node): number[] => {
    const path: number[] = [];
    for (let n: Node | null = el; n && n !== document.documentElement; n = n.parentNode) {
      const parent: Node | null = n.parentNode;
      if (!parent) return [];
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, n));
    }
    return path;
  };
  const resolvePath = (path: number[]): Node | null => path.reduce<Node | null>((n, i) => n?.childNodes[i] ?? null, document.documentElement);
  const reportable = (e: Event): e is Event & { target: Element } => mode === "interact" && e.isTrusted && e.target instanceof Element && !layer.contains(e.target);
  document.addEventListener("click", (e) => reportable(e) && send({ type: "interaction", interaction: { kind: "click", path: pathOf(e.target) } }), true);
  document.addEventListener(
    "input",
    (e) => {
      if (!reportable(e)) return;
      const t = e.target as HTMLInputElement;
      send({ type: "interaction", interaction: { kind: "input", path: pathOf(t), value: t.value, checked: t.checked } });
    },
    true,
  );
  document.addEventListener("keydown", (e) => reportable(e) && (e.key === "Enter" || e.key === "Escape") && send({ type: "interaction", interaction: { kind: "key", path: pathOf(e.target), key: e.key } }), true);
  let scrollQueued = false;
  document.addEventListener(
    "scroll",
    (e) => {
      if (mode !== "interact" || scrollQueued || ignoreScroll) return;
      const el = e.target === document ? document.scrollingElement : (e.target as Element);
      if (!el || (e.target !== document && layer.contains(el))) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        const x = el.scrollWidth > el.clientWidth ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0;
        const y = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
        send({ type: "interaction", interaction: { kind: "scroll", path: el === document.scrollingElement ? [] : pathOf(el), x, y } });
      });
    },
    true,
  );
  let ignoreScroll = false;

  function replay(i: Interaction): boolean {
    if (i.kind === "scroll") {
      const el = (i.path.length === 0 ? document.scrollingElement : resolvePath(i.path)) as Element | null;
      if (!el) return false;
      // Setting the offset fires a scroll event of our own: it must not bounce back to the frame that started it.
      ignoreScroll = true;
      el.scrollTo((i.x ?? 0) * (el.scrollWidth - el.clientWidth), (i.y ?? 0) * (el.scrollHeight - el.clientHeight));
      setTimeout(() => (ignoreScroll = false), 120);
      return true;
    }
    const el = resolvePath(i.path);
    if (!(el instanceof HTMLElement)) return false;
    if (i.kind === "click") return (el.click(), true);
    if (i.kind === "key") {
      for (const type of ["keydown", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key: i.key, bubbles: true, cancelable: true }));
      return true;
    }
    const input = el as HTMLInputElement;
    if (i.checked !== undefined && (input.type === "checkbox" || input.type === "radio")) input.checked = i.checked;
    else Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, i.value ?? "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

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
    setEmulation: ({ touch, dpr }) => ({ touchEvents: emulate(touch, dpr) }),
    setPreview: (p) => ({ elements: setPreview(p) }),
    replay: (interaction) => replay(interaction),
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
