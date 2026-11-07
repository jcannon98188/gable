// The drawer's Focus & tree tab (TASK-56.26): the keyboard focus order of the selected frame's page (each Tab stop with its
// name, role and what is wrong with the order), the accessibility tree (role, name and state of what assistive technology is
// given), and the canvas view: the numbered focus order drawn over the page, and keyboard-only mode. Everything is read from
// the page as rendered; a row selects its element on the canvas.
import { computed, html, inject } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiSwitch } from "../components/ui/switch.js";
import { UiToggleGroup } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { DesignerState } from "./designer-state.js";
import { FocusState, WARNING_TEXT } from "./focus-state.js";

export class FocusPanel {
  static meta = {
    selector: "app-focus-panel",
    host: { class: "flex h-full min-h-0 flex-col" },
    imports: [UiButton, UiSwitch, UiToggleGroup, UiTooltip],
    template: html`
      <div class="dbar">
        <ui-toggle-group class="seg small" data-part="focus-section" [items]="sectionItems" [(value)]="focus.sectionPick" type="single" variant="outline" size="sm"></ui-toggle-group>
        <span class="dim" data-part="focus-summary">{{ summary() }}</span>
        <span class="spacer"></span>
        <ui-switch data-part="focus-overlay" [(value)]="focus.overlay">Show order on canvas</ui-switch>
        <ui-switch data-part="focus-keyboard" [(value)]="focus.keyboardOnly">Keyboard only</ui-switch>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="focus-refresh" [disabled]="!ready()" (click)="focus.refresh()">Refresh</button>
      </div>
      @if (focus.keyboardOnly()) {
        <p class="callout" role="status" data-part="focus-keyboard-note">{{ keyboardNote() }}</p>
      }
      @if (focus.error(); as e) {
        <p class="callout err" role="alert" data-part="focus-error">Could not read the page: {{ e }}</p>
      }
      @if (isTree()) {
        <div class="dbar">
          <ui-switch data-part="tree-selection" [(value)]="focus.fromSelection">Selected element only</ui-switch>
          @if (treeFacts(); as t) {
            <span class="chip" [class.err]="t.hasUnnamed" [class.ok]="!t.hasUnnamed" data-part="tree-unnamed">{{ t.unnamedText }}</span>
            @if (t.skips > 0) {
              <span class="chip warn" data-part="tree-skips">{{ t.skipsText }}</span>
            }
            @if (t.truncated) {
              <span class="chip warn">Cut at {{ t.nodes }} nodes</span>
            }
          }
        </div>
        <div class="min-h-0 flex-1 overflow-auto" role="tree" aria-label="Accessibility tree" data-part="tree">
          @for (r of focus.rows(); track r.key) {
            <div class="tree-row" role="treeitem" data-part="tree-row" [attr.data-role]="r.role" [attr.style]="r.indent" [attr.aria-level]="r.depth" (click)="choose(r.nodeId)" (mouseenter)="focus.hover(r.nodeId)" (mouseleave)="focus.hover(null)">
              @if (r.hasChildren) {
                <button class="btn-plain mono" [attr.aria-label]="r.toggleLabel" [attr.aria-expanded]="r.expanded" data-part="tree-toggle" (click)="toggle(r.key, $event)">{{ r.twisty }}</button>
              }
              <span class="chip mono" [class.warn]="r.hasWarnings" [class.off]="r.isText">{{ r.role }}</span>
              <span class="tree-name" [class.dim]="r.isText" [attr.title]="r.name">{{ r.nameText }}</span>
              @if (r.states) {
                <span class="dim mono">{{ r.states }}</span>
              }
              @if (r.focusable) {
                <span class="chip ok" uiTooltip="In the Tab order" tabindex="0">tab</span>
              }
              @if (r.hasWarnings) {
                <span class="chip err" data-part="tree-warning">{{ r.warnings }}</span>
              }
            </div>
          }
          @if (treeEmpty(); as e) {
            <div class="empty"><strong>{{ e.title }}</strong>{{ e.text }}</div>
          }
        </div>
      } @else {
        <div class="dbar">
          <button uiButton variant="outline" size="sm" class="btn sm" data-part="focus-prev" [disabled]="!ready()" (click)="step('prev')">Previous stop</button>
          <button uiButton variant="outline" size="sm" class="btn sm" data-part="focus-next" [disabled]="!ready()" (click)="step('next')">Next stop</button>
          <span class="dim" data-part="focus-step">{{ stepText() }}</span>
        </div>
        <div class="min-h-0 flex-1 overflow-auto" data-part="focus-list">
          @for (r of stopRows(); track r.index) {
            <div class="tbl-row focus-row" data-part="focus-row" [attr.aria-current]="r.current" (click)="choose(r.nodeId)" (mouseenter)="focus.hover(r.nodeId)" (mouseleave)="focus.hover(null)">
              <span class="chip mono" [class.warn]="r.hasWarnings">{{ r.index }}</span>
              <span class="mono dim">{{ r.role }}</span>
              <span class="a11y-what">
                <span [class.dim]="r.noName">{{ r.nameText }}</span>
                @if (r.warningText) {
                  <span class="dim" data-part="focus-warning">{{ r.warningText }}</span>
                }
              </span>
              <button class="chip mono elink" [disabled]="!r.linked" [attr.title]="r.elementTitle">{{ r.element }}</button>
            </div>
          }
          @for (u of unreachable(); track u.key) {
            <div class="tbl-row focus-row" data-part="focus-unreachable" (click)="choose(u.nodeId)">
              <span class="chip err">no tab</span>
              <span class="mono dim">{{ u.role }}</span>
              <span class="a11y-what">
                <span>{{ u.nameText }}</span>
                <span class="dim">{{ u.reason }}</span>
              </span>
              <span class="chip mono elink">{{ u.element }}</span>
            </div>
          }
          @if (orderEmpty(); as e) {
            <div class="empty"><strong>{{ e.title }}</strong>{{ e.text }}</div>
          }
        </div>
      }
    `,
  };
  focus = inject(FocusState);
  state = inject(DesignerState);

  sectionItems = [
    { value: "order", label: "Focus order" },
    { value: "tree", label: "Accessibility tree" },
  ];
  ready = computed(() => this.state.connection() === "ready");
  isTree = computed(() => this.focus.section() === "tree");

  summary = computed(() => {
    if (this.isTree()) {
      const t = this.focus.tree();
      return t ? `${t.nodes} node${t.nodes === 1 ? "" : "s"}${t.root ? ` under <${t.root.tag}>` : ""} · ${t.url}` : "Not read yet";
    }
    const o = this.focus.order();
    if (!o) return "Not read yet";
    const n = o.stops.length;
    return `${n} Tab stop${n === 1 ? "" : "s"}${o.scripted.length ? `, ${o.scripted.length} by script only` : ""} · ${o.url}`;
  });

  keyboardNote = computed(() =>
    this.state.mode() === "interact"
      ? "Keyboard only: the page ignores the mouse here. Click the frame once, then use Tab, Shift+Tab, Enter and Space; the focused element is outlined."
      : "Keyboard only is on, but the canvas is in Select mode. Switch to Interact to try the page with the keyboard alone.",
  );

  stepText = computed(() => {
    const s = this.focus.lastStep();
    if (!s) return "";
    if (s.trapped) return s.trapped;
    const v = s.visited[s.visited.length - 1];
    if (!v) return s.note;
    return `Focus: stop ${v.index} of ${s.stops}, ${v.role}${v.name ? ` "${v.name}"` : " (no name)"}${v.indicator ? "" : ": no visible focus indicator"}`;
  });

  stopRows = computed(() => {
    const picked = this.state.picked()?.node.id;
    return (this.focus.order()?.stops ?? []).map((s) => ({
      index: s.index,
      role: s.role,
      noName: !s.name,
      nameText: s.name || "(no name)",
      hasWarnings: s.warnings.length > 0,
      warningText: s.warnings.map((w) => WARNING_TEXT[w]).join(". "),
      nodeId: s.node?.id ?? null,
      linked: !!s.node,
      element: s.node ? `<${s.node.tag}>${s.node.component ? ` in ${s.node.component}` : ""}` : "not in a template",
      elementTitle: s.node ? "Select this element" : "No template renders this element",
      current: (s.node && s.node.id === picked) || s.focused ? "true" : null,
    }));
  });

  unreachable = computed(() =>
    (this.focus.order()?.unreachable ?? []).map((u, i) => ({
      key: `${i}`,
      role: u.role,
      nameText: u.name || `<${u.tag}>`,
      reason: u.reason,
      nodeId: u.node?.id ?? null,
      element: u.node ? `<${u.node.tag}>${u.node.component ? ` in ${u.node.component}` : ""}` : "not in a template",
    })),
  );

  orderEmpty = computed(() => {
    if (this.focus.order()?.stops.length || this.unreachable().length || this.focus.error()) return null;
    if (!this.ready()) return { title: "No page", text: "The focus order is read from the selected frame once its page is connected." };
    if (!this.focus.order()) return { title: "Reading…", text: "The Preview agent is reading the page's Tab stops." };
    return { title: "Nothing to tab to", text: "No link, button, field or other control on this page can take keyboard focus." };
  });

  treeFacts = computed(() => {
    const t = this.focus.tree();
    if (!t) return null;
    return {
      hasUnnamed: t.unnamed > 0,
      unnamedText: t.unnamed === 0 ? "Every control has a name" : `${t.unnamed} without a name`,
      skips: t.headingSkips,
      skipsText: `${t.headingSkips} heading level skip${t.headingSkips === 1 ? "" : "s"}`,
      truncated: t.truncated,
      nodes: t.nodes,
    };
  });

  treeEmpty = computed(() => {
    if (this.focus.rows().length || this.focus.error()) return null;
    if (!this.ready()) return { title: "No page", text: "The accessibility tree is read from the selected frame once its page is connected." };
    if (!this.focus.tree()) return { title: "Reading…", text: "The Preview agent is reading the page." };
    return { title: "Nothing exposed", text: "Nothing on this page is exposed to assistive technology." };
  });

  choose(id: string | null): void {
    this.focus.select(id);
  }
  toggle(key: string, e: Event): void {
    e.stopPropagation();
    this.focus.toggleCollapsed(key);
  }
  step(to: "next" | "prev"): void {
    void this.focus.step(to).catch(() => undefined);
  }
}
