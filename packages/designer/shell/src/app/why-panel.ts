// The drawer's Why tab (TASK-56.19): for the selected element, what each of its bindings depends on (the signals it reads,
// through computeds) and why it last updated: the signal writes the devtools hook recorded behind each run. "Highlight
// updates" outlines, on the canvas, the elements whose bindings re-run. Everything is the hook's own record; a run no write
// explains says so instead of guessing.
import { computed, html, inject } from "@gable/core";
import { bindingTitle, dependencyRows, runText } from "../../../src/why.js";
import { UiButton } from "../components/ui/button.js";
import { UiSwitch } from "../components/ui/switch.js";
import { WhyState } from "./why-state.js";

export class WhyTab {
  static meta = {
    selector: "app-why-tab",
    host: { class: "block" },
    imports: [UiButton, UiSwitch],
    template: html`
      <div class="dbar">
        <span class="dim" data-part="why-summary">{{ view().summary }}</span>
        <span class="spacer"></span>
        <button uiButton variant="outline" size="sm" class="chip" data-part="why-scope-element" [class.on]="view().isElement" [attr.aria-pressed]="view().isElement" (click)="scope('element')">Element</button>
        <button uiButton variant="outline" size="sm" class="chip" data-part="why-scope-component" [class.on]="view().isComponent" [attr.aria-pressed]="view().isComponent" (click)="scope('component')">Component</button>
        <ui-switch data-part="why-highlight" [(value)]="highlight">Highlight updates</ui-switch>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="why-refresh" (click)="refresh()">Refresh</button>
      </div>
      @if (view().highlightError) {
        <p class="callout warn" role="status" data-part="why-highlight-error">{{ view().highlightError }}</p>
      }
      @if (view().show) {
        @if (view().noBindings) {
          <div class="empty" data-part="why-none"><strong>No dynamic bindings</strong>{{ view().noBindings }}</div>
        }
        @for (n of view().nodes; track n.id) {
          <section class="pad" data-part="why-node" [attr.data-effect]="n.id">
            <div class="dbar">
              <strong class="mono" data-part="why-title">{{ n.title }}</strong>
              <span class="chip">ran {{ n.runs }}×</span>
            </div>
            @for (r of n.recent; track r.key) {
              <p class="mono" data-part="why-run" [attr.data-first]="r.first" [attr.data-unexplained]="r.unexplained"><span class="dim">{{ r.time }}</span> {{ r.text }}</p>
            }
            @if (n.hasDeps) {
              <div class="dim">Depends on</div>
              @for (d of n.deps; track d.key) {
                <div class="tbl-row grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" data-part="why-dep" [attr.data-name]="d.name" [style.padding-left]="d.indent">
                  <span class="mono truncate" [attr.title]="d.title">{{ d.name }} <span class="dim">{{ d.note }}</span></span>
                  <span class="chip">{{ d.kind }}</span>
                  <span class="mono truncate dim" [attr.title]="d.value">{{ d.value }}</span>
                </div>
              }
            } @else {
              <p class="dim">It reads no signals.</p>
            }
          </section>
        }
        @if (view().elsewhere) {
          <p class="callout info" data-part="why-elsewhere">{{ view().elsewhere }}</p>
        }
      } @else {
        <div class="empty" data-part="why-empty"><strong>Nothing to explain yet</strong>{{ view().emptyText }}</div>
      }
    `,
  };
  why = inject(WhyState);
  highlight = this.why.highlight;

  view = computed(() => {
    const s = this.why.shown();
    const n = s?.nodes.length ?? 0;
    const owner = s?.component?.name ?? "its component";
    return {
      show: !!s,
      summary: this.why.summary(),
      emptyText: this.why.empty(),
      isElement: this.why.scope() === "element",
      isComponent: this.why.scope() === "component",
      highlightError: this.why.highlightError(),
      noBindings: s && s.scope === "element" && n === 0 ? `${s.title} is static: no binding reads a signal, so nothing in the app ever updates it.` : "",
      elsewhere: !s || s.elsewhere === 0 ? "" : s.scope === "element" ? `${owner} has ${s.elsewhere} more effect${s.elsewhere === 1 ? "" : "s"} that update other elements: switch to Component to see them.` : `${s.elsewhere} more effect${s.elsewhere === 1 ? " is" : "s are"} not shown.`,
      nodes: (s?.nodes ?? []).map((node) => {
        const deps = dependencyRows(node.dependencies);
        return {
          id: node.id,
          title: bindingTitle(node),
          runs: node.runs,
          hasDeps: deps.length > 0,
          recent: [...node.recent].reverse().map((r, i) => ({
            key: `${node.id}:${i}`,
            first: r.first,
            unexplained: !r.first && r.causes.length === 0,
            time: `${(r.at / 1000).toFixed(2)}s`,
            text: runText(r),
          })),
          deps: deps.map((d) => ({
            key: `${node.id}:${d.key}`,
            name: d.name,
            kind: d.kind,
            value: d.value,
            note: d.note,
            title: d.owner ? `${d.owner}.${d.name}` : d.name,
            indent: `${12 + d.depth * 16}px`,
          })),
        };
      }),
    };
  });

  scope(which: "element" | "component"): void {
    this.why.setScope(which);
  }

  refresh(): void {
    void this.why.refresh();
  }
}
