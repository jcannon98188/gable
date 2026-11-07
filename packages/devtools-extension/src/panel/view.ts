// Renders the panel state into the DOM. Plain DOM calls, text only (nothing from the page is ever set as HTML).
import type { ComponentDetail, Edge, EffectInfo, FlushRecord, InjectorEntry, Preview, RouteNode, SignalInfo, TreeNode } from "../protocol.js";
import { TABS, type Panel, type PanelState } from "./model.js";

type Child = Node | string | null | false | undefined;
type Props = { class?: string; title?: string; onclick?: (e: MouseEvent) => void; ondblclick?: (e: MouseEvent) => void; onmouseenter?: () => void; onmouseleave?: () => void; [key: string]: unknown };

export function h(tag: string, props: Props | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const SLOW_MS = 4;

function previewNode(p: Preview): HTMLElement {
  const head = h("span", { class: `v v-${p.t}` }, p.s);
  if (!p.children || p.children.length === 0) return head;
  const body = h("div", { class: "kids" });
  for (const [k, v] of p.children) body.append(h("div", { class: "kid" }, h("span", { class: "k" }, `${k}: `), previewNode(v)));
  if (p.more) body.append(h("div", { class: "kid dim" }, `… ${p.more} more`));
  return h("details", { class: "preview" }, h("summary", null, head), body);
}

function edges(label: string, list: Edge[], panel: Panel): HTMLElement | null {
  if (list.length === 0) return null;
  return h(
    "div",
    { class: "edges" },
    h("span", { class: "dim" }, `${label} `),
    ...list.map((e) => h("button", { class: `chip kind-${e.kind}`, title: e.kind, onclick: () => void panel.focusSignal(e.id) }, e.name)),
  );
}

function signalRow(s: SignalInfo, panel: Panel, state: PanelState): HTMLElement {
  const editing = state.editing?.id === s.id;
  const valueCell = editing
    ? (() => {
        const input = h("input", { class: "edit", value: state.editing!.text, spellcheck: "false" }) as HTMLInputElement;
        input.addEventListener("input", () => panel.draft(input.value));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") void panel.commitEdit();
          else if (e.key === "Escape") panel.cancelEdit();
        });
        queueMicrotask(() => input.focus());
        return input;
      })()
    : h(
        "span",
        {
          class: s.writable ? "value editable" : "value",
          title: s.writable ? "Double-click to edit (JSON)" : undefined,
          ondblclick: s.writable ? () => panel.startEdit(s.id, s.value.t === "unset" ? "" : s.value.t === "undefined" ? "undefined" : jsonOf(s.value)) : undefined,
        },
        previewNode(s.value),
      );
  return h(
    "div",
    { class: `signal${state.focus?.id === s.id ? " focused" : ""}`, "data-id": s.id },
    h("button", { class: `name kind-${s.kind}`, title: "Show dependencies", onclick: () => void panel.focusSignal(s.id) }, s.name),
    h("span", { class: `badge kind-${s.kind}` }, s.kind),
    valueCell,
  );
}

/** The editable text of a preview: JSON for what survives it, the display string otherwise. */
function jsonOf(p: Preview): string {
  const build = (x: Preview): unknown => {
    if (x.children) return x.t === "array" ? x.children.map(([, v]) => build(v)) : Object.fromEntries(x.children.map(([k, v]) => [k, build(v)]));
    if (x.t === "string") return JSON.parse(x.s);
    if (x.t === "number" || x.t === "boolean") return JSON.parse(x.s);
    if (x.t === "null") return null;
    return x.s;
  };
  try {
    return JSON.stringify(build(p));
  } catch {
    return p.s;
  }
}

function dependencies(s: SignalInfo, panel: Panel): HTMLElement {
  return h(
    "div",
    { class: "deps" },
    h("div", { class: "section-title" }, `Dependencies of ${s.name}`),
    edges("reads", s.sources, panel) ?? h("div", { class: "dim" }, s.kind === "state" || s.kind === "input" || s.kind === "model" ? "A source signal: it reads nothing." : "Reads nothing yet."),
    edges("read by", s.sinks, panel) ?? h("div", { class: "dim" }, "Nothing reads it right now."),
  );
}

function effectRow(e: EffectInfo, panel: Panel): HTMLElement {
  return h(
    "div",
    { class: "effect" },
    h("span", { class: "name" }, e.label),
    h("span", { class: `dim${e.lastMs > SLOW_MS ? " slow" : ""}` }, `${e.runs} runs, last ${e.lastMs} ms, total ${e.totalMs} ms`),
    edges("reads", e.sources, panel),
  );
}

function treeRows(state: PanelState, panel: Panel): HTMLElement {
  const byParent = new Map<string | null, TreeNode[]>();
  for (const n of state.tree) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  const root = h("div", { class: "tree" });
  const walk = (parent: string | null, depth: number) => {
    for (const n of byParent.get(parent) ?? []) {
      const kids = byParent.get(n.id) ?? [];
      const collapsed = state.collapsed.has(n.id);
      root.append(
        h(
          "div",
          {
            class: `row${state.selected === n.id ? " selected" : ""}`,
            style: `padding-left:${8 + depth * 14}px`,
            "data-id": n.id,
            onclick: () => void panel.select(n.id),
            onmouseenter: () => void panel.hover(n.id),
            onmouseleave: () => void panel.hover(null),
          },
          kids.length > 0
            ? h("button", { class: "twisty", onclick: (e: MouseEvent) => (e.stopPropagation(), panel.toggle(n.id)) }, collapsed ? "▸" : "▾")
            : h("span", { class: "twisty" }, " "),
          h("span", { class: "tag" }, "<"),
          h("span", { class: "cname" }, n.name),
          h("span", { class: "tag" }, ">"),
          n.injector ? h("span", { class: "badge", title: "Has its own injector" }, "providers") : null,
        ),
      );
      if (!collapsed) walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  if (state.tree.length === 0) root.append(h("div", { class: "empty" }, "No components yet."));
  return root;
}

function componentDetail(d: ComponentDetail, state: PanelState, panel: Panel): HTMLElement {
  const group = (title: string, rows: HTMLElement[], empty: string) =>
    h("section", null, h("div", { class: "section-title" }, title), ...(rows.length > 0 ? rows : [h("div", { class: "dim" }, empty)]));
  return h(
    "div",
    { class: "detail" },
    h(
      "div",
      { class: "detail-head" },
      h("strong", null, d.name),
      h("span", { class: "dim" }, d.selector),
      h("button", { class: "action", title: d.source?.path ?? "No source known", onclick: () => void panel.openSource() }, d.source ? `Open ${d.source.path}` : "Open source"),
      h("button", { class: "action", onclick: () => void panel.revealElement() }, "Reveal element"),
    ),
    group("Inputs", d.inputs.map((s) => signalRow(s, panel, state)), "No inputs."),
    group("Signals and computeds", d.signals.map((s) => signalRow(s, panel, state)), "No signals on this component."),
    d.outputs.length > 0 ? group("Outputs", d.outputs.map((o) => h("div", { class: "name" }, o)), "") : null,
    state.focus ? dependencies(state.focus, panel) : null,
    group("Effects", d.effects.map((e) => effectRow(e, panel)), "No effects."),
  ) as HTMLElement;
}

function componentsTab(state: PanelState, panel: Panel): HTMLElement {
  return h(
    "div",
    { class: "split" },
    h("div", { class: "pane tree-pane" }, h("div", { class: "toolbar" }, h("button", { class: "action", title: "Use the element selected in the Elements panel", onclick: () => void panel.pickFromElements() }, "Pick from Elements ($0)")), treeRows(state, panel)),
    h("div", { class: "pane detail-pane" }, state.detail ? componentDetail(state.detail, state, panel) : h("div", { class: "empty" }, state.selected ? "Loading…" : "Select a component.")),
  );
}

function injectorsTab(state: PanelState, panel: Panel): HTMLElement {
  const byParent = new Map<string | null, typeof state.injectors>();
  for (const i of state.injectors) byParent.set(i.parent, [...(byParent.get(i.parent) ?? []), i]);
  const list = h("div", { class: "tree" });
  const walk = (parent: string | null, depth: number) => {
    for (const i of byParent.get(parent) ?? []) {
      list.append(
        h(
          "div",
          { class: `row${state.selectedInjector === i.id ? " selected" : ""}`, style: `padding-left:${8 + depth * 14}px`, onclick: () => void panel.selectInjector(i.id) },
          h("span", { class: "cname" }, i.component ? `${i.component.name} (providers)` : parent ? "injector" : "root injector"),
          h("span", { class: "dim" }, ` ${i.entryCount}`),
        ),
      );
      walk(i.id, depth + 1);
    }
  };
  // Injectors whose parent was never seen (created before the panel attached) are shown at the top.
  const known = new Set(state.injectors.map((i) => i.id));
  for (const p of [...byParent.keys()]) if (p !== null && !known.has(p)) walk(p, 0);
  walk(null, 0);
  const d = state.injectorDetail;
  const entry = (e: InjectorEntry) =>
    h(
      "div",
      { class: "entry" },
      h("span", { class: `name kind-${e.kind}` }, e.name),
      h("span", { class: "badge" }, e.kind),
      e.resolved ? previewNode(e.value) : h("span", { class: "dim" }, "not created yet"),
      ...e.signals.map((s) => signalRow(s, panel, state)),
    );
  return h(
    "div",
    { class: "split" },
    h("div", { class: "pane tree-pane" }, list),
    h("div", { class: "pane detail-pane" }, d ? h("div", { class: "detail" }, h("div", { class: "section-title" }, "Providers and resolved values"), ...d.entries.map(entry)) : h("div", { class: "empty" }, "No injector selected.")),
  );
}

function routeRows(routes: RouteNode[], depth = 0): HTMLElement[] {
  return routes.flatMap((r) => [
    h(
      "div",
      { class: `route${r.active ? " active" : ""}`, style: `padding-left:${8 + depth * 14}px` },
      h("span", { class: "cname" }, `/${r.path}`),
      r.component ? h("span", { class: "dim" }, ` → ${r.component}`) : null,
      r.redirectTo ? h("span", { class: "dim" }, ` ⇒ ${r.redirectTo}`) : null,
      r.guards.length > 0 ? h("span", { class: "badge" }, r.guards.join(", ")) : null,
      r.children === "lazy" ? h("span", { class: "badge" }, "lazy children") : null,
    ),
    ...(Array.isArray(r.children) ? routeRows(r.children, depth + 1) : []),
  ]);
}

function routerTab(state: PanelState, panel: Panel): HTMLElement {
  if (state.routers.length === 0) return h("div", { class: "empty" }, "No router in this app.");
  return h(
    "div",
    { class: "pane full" },
    ...state.routers.map((r) => {
      const input = h("input", { class: "edit", value: r.url, spellcheck: "false" }) as HTMLInputElement;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void panel.navigate(r.id, input.value);
      });
      return h(
        "div",
        { class: "router" },
        h("div", { class: "section-title" }, r.navigating ? "Router (navigating…)" : "Router"),
        h("div", null, h("span", { class: "dim" }, "url "), input, h("span", { class: "dim" }, "  Enter navigates")),
        h("div", null, h("span", { class: "dim" }, "params "), previewNode(r.params)),
        h("div", null, h("span", { class: "dim" }, "query "), previewNode(r.queryParams)),
        h("div", null, h("span", { class: "dim" }, "fragment "), previewNode(r.fragment)),
        h("div", null, h("span", { class: "dim" }, "data "), previewNode(r.data)),
        h("div", { class: "section-title" }, "Routes (active chain highlighted)"),
        ...routeRows(r.routes),
        h("div", { class: "section-title" }, "Navigation events"),
        ...[...r.events].reverse().map((e) => h("div", { class: "log" }, h("span", { class: "dim" }, `#${e.id} `), h("span", { class: `evt-${e.type}` }, e.type), ` ${e.url}`, e.detail ? h("span", { class: "dim" }, ` (${e.detail})`) : null)),
      );
    }),
  );
}

function flushRow(f: FlushRecord): HTMLElement {
  const runs = [...f.runs].sort((a, b) => b.ms - a.ms);
  return h(
    "details",
    { class: `flush${f.ms > SLOW_MS ? " slow" : ""}` },
    h("summary", null, h("span", { class: "name" }, f.kind === "init" ? "initial runs" : "flush"), h("span", { class: "dim" }, ` ${f.runs.length + f.more} effect runs, ${f.rounds} rounds, `), h("span", { class: f.ms > SLOW_MS ? "slow" : "" }, `${f.ms} ms`)),
    ...runs.map((r) => h("div", { class: "log" }, h("span", { class: r.ms > SLOW_MS ? "slow" : "" }, `${r.ms} ms`), ` ${r.label}`, r.component ? h("span", { class: "dim" }, ` in ${r.component}`) : null, r.first ? h("span", { class: "badge" }, "first run") : null)),
    f.more > 0 ? h("div", { class: "dim" }, `… ${f.more} more runs not listed`) : null,
  );
}

function effectsTab(state: PanelState, panel: Panel): HTMLElement {
  return h(
    "div",
    { class: "pane full" },
    h("div", { class: "toolbar" }, h("button", { class: "action", onclick: () => void panel.clearEffects() }, "Clear"), h("span", { class: "dim" }, "Timings are recorded while this panel is open.")),
    ...(state.effects.length === 0 ? [h("div", { class: "empty" }, "No flushes yet. Interact with the app.")] : [...state.effects].reverse().map(flushRow)),
  );
}

function hmrTab(state: PanelState): HTMLElement {
  return h(
    "div",
    { class: "pane full" },
    ...(state.hmr.length === 0 ? [h("div", { class: "empty" }, "No hot updates yet. Edit a component.")] : [...state.hmr].reverse().map((e) => h("div", { class: "log" }, h("span", { class: `evt-${e.status}` }, e.status), h("span", { class: "dim" }, ` ${e.modules.join(", ")}`), ...e.errors.map((m) => h("div", { class: "slow" }, m))))),
  );
}

function inspectorsTab(state: PanelState): HTMLElement {
  if (state.inspectors.length === 0) {
    return h("div", { class: "empty" }, "Nothing registered. Stores and other packages show their state and history here (hook.registerInspector).");
  }
  return h(
    "div",
    { class: "pane full" },
    ...state.inspectors.map((i) =>
      h("section", null, h("div", { class: "section-title" }, i.label), previewNode(i.snapshot), h("div", { class: "section-title" }, "History"), ...[...i.log].reverse().map((l) => h("div", { class: "log" }, h("span", { class: "name" }, l.type), " ", previewNode(l.data)))),
    ),
  );
}

export function render(root: HTMLElement, panel: Panel): void {
  const { state } = panel;
  // Keep the scroll positions of the panes across a re-render.
  const scrolls = [...root.querySelectorAll(".pane")].map((p) => p.scrollTop);
  const body =
    !state.connected
      ? h("div", { class: "empty" }, "Waiting for a Gable app. It must be a development build (the Vite dev server); production builds carry no devtools hook.")
      : state.tab === "components"
        ? componentsTab(state, panel)
        : state.tab === "injectors"
          ? injectorsTab(state, panel)
          : state.tab === "router"
            ? routerTab(state, panel)
            : state.tab === "effects"
              ? effectsTab(state, panel)
              : state.tab === "hmr"
                ? hmrTab(state)
                : inspectorsTab(state);
  root.replaceChildren(
    h("nav", { class: "tabs" }, ...TABS.map((t) => h("button", { class: `tab${state.tab === t.id ? " active" : ""}`, onclick: () => void panel.setTab(t.id) }, t.label))),
    ...(state.message ? [h("div", { class: `message ${state.message.kind}` }, state.message.text)] : []),
    h("div", { class: "body" }, body),
  );
  root.querySelectorAll(".pane").forEach((p, i) => {
    p.scrollTop = scrolls[i] ?? 0;
  });
}
