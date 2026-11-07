import { computed, html, inject, signal } from "@gable/core";
import { TABS, TabsState } from "@gable/ui-primitives";
import { primitivesStyles } from "./primitives-style.js";

/**
 * Tabs from the headless parts. The Zag machine gives the tablist roving focus: only the selected tab is in the tab order,
 * arrows move between tabs (skipping the disabled one), Home and End jump to the ends. The selected value is a signal you own.
 */
export class TabsDemo {
  static meta = {
    selector: "tabs-demo",
    providers: [TabsState],
    imports: [...TABS],
    styles: [
      ...primitivesStyles,
      `
[uiTabsList]{display:flex;gap:2px;border-bottom:1px solid var(--line);overflow-x:auto}
[uiTabTrigger]{appearance:none;border:0;border-bottom:2px solid transparent;background:none;color:var(--mut);font:500 14px Inter,system-ui,sans-serif;padding:8px 12px;min-height:40px;cursor:pointer;white-space:nowrap}
[uiTabTrigger][data-selected]{color:var(--tx);border-bottom-color:var(--acc)}
[uiTabTrigger][data-disabled]{opacity:.45;cursor:not-allowed}
[uiTabTrigger]:focus-visible{outline:2px solid var(--acc);outline-offset:-2px;border-radius:6px}
[uiTabContent]{padding:14px 4px;font-size:14px}
[uiTabContent]:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:6px}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Tabs, headless</h3>
<p>Focus a tab, then press <kbd>←</kbd> <kbd>→</kbd> <kbd>Home</kbd> or <kbd>End</kbd>. The disabled tab is skipped.</p>
</div>
<div class="db">
<div uiTabsRoot>
<div uiTabsList aria-label="Project sections">
<button type="button" uiTabTrigger="overview">Overview</button>
<button type="button" uiTabTrigger="activity">Activity</button>
<button type="button" uiTabTrigger="billing" [disabled]="true">Billing</button>
<button type="button" uiTabTrigger="settings">Settings</button>
</div>
<div uiTabContent="overview">Overview: the selected tab is the only one in the tab order.</div>
<div uiTabContent="activity">Activity: arrows move focus, and focus selects the tab.</div>
<div uiTabContent="settings">Settings: panels are <code>role="tabpanel"</code>, labelled by their tab.</div>
</div>
<p class="status" aria-live="polite">Selected tab: <b>{{ label() }}</b></p>
</div>
</div>
    `,
  };

  tab = signal<string | null>("overview");
  tabs = inject(TabsState).bind(() => ({
    value: this.tab(),
    onValueChange: (d: { value: string }) => this.tab.set(d.value),
  }));
  label = computed(() => this.tab() ?? "none");
}
