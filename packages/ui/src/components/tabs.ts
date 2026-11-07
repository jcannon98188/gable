import { computed, contentChildren, effect, html, inject, input, model, signal } from "@gable/core";
import { TABS, TabsState, bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import type { InputDensity } from "./input.js";

/**
 * One panel of `<ui-tabs>`: `<ui-tab value="account" label="Account">...</ui-tab>`.
 * The tabs component collects its `ui-tab` children to draw the tab buttons, and hands them its machine state (projected
 * content is injected from the component that declares it, so a tab cannot inject the state itself).
 */
export class UiTab {
  static meta = { selector: "ui-tab", host: { class: "flex-1 outline-none" }, template: html`<slot></slot>` };
  value = input<string>("");
  label = input<string>("");
  /** A count or status shown after the label, inside the trigger (so it is part of the trigger's accessible name). */
  badge = input<string | number>("");
  disabled = input<boolean>(false);
  owner = signal<TabsState | null>(null);
  item = computed(() => ({ value: this.value(), label: this.label(), badge: String(this.badge() ?? ""), disabled: this.disabled() }));
  private props = bindProps(() => {
    const owner = this.owner();
    return owner && this.value() ? owner.api().getContentProps({ value: this.value() }) : null;
  });
}

const LIST = "inline-flex w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground";
const TRIGGER =
  "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent whitespace-nowrap text-foreground font-medium transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-background data-[selected]:shadow-sm dark:text-muted-foreground dark:data-[selected]:border-input dark:data-[selected]:bg-input/30 dark:data-[selected]:text-foreground";

/**
 * Tabs.
 *
 *   <ui-tabs [(value)]="tab">
 *     <ui-tab value="account" label="Account">Account settings</ui-tab>
 *     <ui-tab value="password" label="Password">Change your password</ui-tab>
 *     <ui-tab value="billing" label="Billing" [disabled]="true">Billing</ui-tab>
 *   </ui-tabs>
 *
 * Arrow keys, Home and End move between enabled tabs. With no `value` the first enabled tab is selected.
 * The selected trigger has `data-selected`, which the styles below hook into.
 */
export class UiTabs {
  static meta = {
    selector: "ui-tabs",
    providers: [TabsState],
    imports: [...TABS],
    template: html`
      <div uiTabsRoot class="flex flex-col gap-2">
        <div uiTabsList [attr.class]="listClasses()">
          @for (tab of tabs(); track tab.value) {
            <button
              [uiTabTrigger]="tab.value"
              [disabled]="tab.disabled"
              [attr.class]="triggerClasses()"
            >
              {{ tab.label }}
              @if (tab.badge !== "") {
                <span [attr.class]="badgeClasses()" data-tab-badge>{{ tab.badge }}</span>
              }
            </button>
          }
        </div>
        <slot></slot>
      </div>
    `,
  };

  /** Two-way: `[(value)]="tab"`. */
  value = model("");
  /** `"compact"` is the dense variant: a 26px tab list and 12px text. */
  density = input<InputDensity>("default");
  listClasses = computed(() => cn(LIST, this.density() === "compact" ? "h-6.5 p-0.5" : "h-9"));
  triggerClasses = computed(() => cn(TRIGGER, this.density() === "compact" ? "px-1.5 text-xs" : "px-2 py-1 text-sm"));
  badgeClasses = computed(() =>
    cn(
      "inline-flex min-w-4 items-center justify-center rounded-full bg-muted px-1 font-medium text-muted-foreground tabular-nums [button[data-selected]_&]:bg-primary/10 [button[data-selected]_&]:text-foreground",
      this.density() === "compact" ? "h-3.5 text-[10px]" : "h-4 text-xs",
    ),
  );
  panels = contentChildren(UiTab);
  tabs = computed(() => this.panels().map((panel) => panel.item()));
  /** The selected value: the model, or the first enabled tab while it is empty. */
  active = computed(() => {
    const tabs = this.tabs();
    const value = this.value();
    return (value && tabs.some((tab) => tab.value === value) ? value : tabs.find((tab) => !tab.disabled)?.value) || null;
  });

  state = inject(TabsState).bind(() => ({
    value: this.active(),
    onValueChange: (details) => this.value.set(details.value),
  }));
  /** A selected tab that disappears (a conditional `ui-tab`) falls back to the first enabled tab, in the model too. */
  private fallback = effect(() => {
    const tabs = this.tabs();
    const value = this.value();
    if (tabs.length > 0 && value && !tabs.some((tab) => tab.value === value)) this.value.set(this.active() ?? "");
  });
  private link = effect(() => {
    for (const panel of this.panels()) panel.owner.set(this.state);
  });
}
