// Machine-readable description of every component in `components/`, for the gable-ui CLI and for tests.
// Update it when you add, rename or remove a component: `registry-meta.test.ts` checks it against the real imports.
//
// - `files`: paths relative to `src/components` that make up the component (one file per component).
// - `dependencies`: npm packages the component imports directly. `@gable/core` and `@gable/ui-primitives` are workspace packages.
// - `registryDependencies`: other components (by `name`) whose files must be copied along with this one.
// - `lib`: helper modules from `src/lib` (see `LIB_META`) the component imports.
// - `exports`: the public names the file exports.

export interface ComponentMeta {
  name: string;
  files: string[];
  exports: string[];
  dependencies: string[];
  registryDependencies: string[];
  lib: string[];
}

export interface LibMeta {
  name: string;
  /** Path relative to `src/lib`. */
  file: string;
  dependencies: string[];
  /** Other lib modules this one imports. */
  lib: string[];
}

/** The shared helpers every component may import. `theme.css` (package root) holds the design tokens and animations they assume. */
export const LIB_META: LibMeta[] = [
  { name: "cn", file: "cn.ts", dependencies: ["clsx", "tailwind-merge"], lib: [] },
  { name: "variants", file: "variants.ts", dependencies: [], lib: ["cn"] },
  { name: "host-class", file: "host-class.ts", dependencies: ["@gable/core"], lib: [] },
  { name: "icon", file: "icon.ts", dependencies: ["@gable/core", "lucide"], lib: ["cn"] },
  { name: "placement", file: "placement.ts", dependencies: [], lib: [] },
];

export const COMPONENT_META: ComponentMeta[] = [
  {
    name: "accordion",
    files: ["accordion.ts"],
    exports: ["UiAccordionItem", "UiAccordion"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["icon"],
  },
  {
    name: "alert-dialog",
    files: ["alert-dialog.ts"],
    exports: ["UiAlertDialog"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: ["button", "dialog"],
    lib: ["cn"],
  },
  {
    name: "alert",
    files: ["alert.ts"],
    exports: ["AlertVariant", "alertVariants", "UiAlert", "UiAlertTitle", "UiAlertDescription"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "host-class", "variants"],
  },
  {
    name: "avatar",
    files: ["avatar.ts"],
    exports: ["UiAvatar"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn"],
  },
  {
    name: "badge",
    files: ["badge.ts"],
    exports: ["BadgeVariant", "badgeVariants", "UiBadge"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["host-class", "variants"],
  },
  {
    name: "breadcrumb",
    files: ["breadcrumb.ts"],
    exports: ["UiBreadcrumb", "UiBreadcrumbList", "UiBreadcrumbItem", "UiBreadcrumbLink", "UiBreadcrumbPage", "UiBreadcrumbSeparator", "UiBreadcrumbEllipsis"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "host-class", "icon"],
  },
  {
    name: "button",
    files: ["button.ts"],
    exports: ["ButtonVariant", "ButtonSize", "buttonVariants", "UiButton"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["host-class", "variants"],
  },
  {
    name: "card",
    files: ["card.ts"],
    exports: ["UiCard", "UiCardHeader", "UiCardTitle", "UiCardDescription", "UiCardContent", "UiCardFooter"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "checkbox",
    files: ["checkbox.ts"],
    exports: ["UiCheckbox"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "icon"],
  },
  {
    name: "collapsible",
    files: ["collapsible.ts"],
    exports: ["CollapsibleTrigger", "UiCollapsible"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: [],
  },
  {
    name: "combobox",
    files: ["combobox.ts"],
    exports: ["ComboboxItem", "UiCombobox"],
    dependencies: ["@gable/core", "@gable/ui-primitives", "@zag-js/combobox"],
    registryDependencies: [],
    lib: ["cn", "icon"],
  },
  {
    name: "context-menu",
    files: ["context-menu.ts"],
    exports: ["UiContextMenu"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: ["dropdown-menu"],
    lib: ["cn", "icon"],
  },
  {
    name: "dialog",
    files: ["dialog.ts"],
    exports: ["DialogTrigger", "UiDialog"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "icon"],
  },
  {
    name: "dropdown-menu",
    files: ["dropdown-menu.ts"],
    exports: ["MenuEntry", "MENU_CONTENT", "MenuRow", "menuRows", "MenuTrigger", "UiDropdownMenu"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "icon", "placement"],
  },
  {
    name: "form",
    files: ["form.ts"],
    exports: ["UiForm", "DEFAULT_MESSAGES", "UiFieldControl", "UiField"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn"],
  },
  {
    name: "hover-card",
    files: ["hover-card.ts"],
    exports: ["HoverCardTrigger", "UiHoverCard"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "placement"],
  },
  {
    name: "input",
    files: ["input.ts"],
    exports: ["UiInput"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "label",
    files: ["label.ts"],
    exports: ["UiLabel"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "pagination",
    files: ["pagination.ts"],
    exports: ["UiPagination"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: ["button"],
    lib: ["cn", "icon"],
  },
  {
    name: "popover",
    files: ["popover.ts"],
    exports: ["PopoverTrigger", "UiPopover"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "placement"],
  },
  {
    name: "progress",
    files: ["progress.ts"],
    exports: ["UiProgress"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn"],
  },
  {
    name: "radio-group",
    files: ["radio-group.ts"],
    exports: ["RadioItem", "UiRadioGroup"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "icon"],
  },
  {
    name: "scroll-area",
    files: ["scroll-area.ts"],
    exports: ["UiScrollArea"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: [],
  },
  {
    name: "select",
    files: ["select.ts"],
    exports: ["UiSelect"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "icon"],
  },
  {
    name: "separator",
    files: ["separator.ts"],
    exports: ["UiSeparator"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "sheet",
    files: ["sheet.ts"],
    exports: ["SheetSide", "UiSheet"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: ["dialog"],
    lib: ["cn", "icon"],
  },
  {
    name: "skeleton",
    files: ["skeleton.ts"],
    exports: ["UiSkeleton"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "slider",
    files: ["slider.ts"],
    exports: ["UiSlider"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn"],
  },
  {
    name: "sortable",
    files: ["sortable.ts"],
    exports: ["SortableRow", "UiSortableList"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "icon"],
  },
  {
    name: "switch",
    files: ["switch.ts"],
    exports: ["UiSwitch"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn"],
  },
  {
    name: "table",
    files: ["table.ts"],
    exports: ["UiTableContainer", "UiTable", "UiTableHeader", "UiTableBody", "UiTableFooter", "UiTableRow", "UiTableHead", "UiTableCell", "UiTableCaption"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "tabs",
    files: ["tabs.ts"],
    exports: ["UiTab", "UiTabs"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: [],
  },
  {
    name: "textarea",
    files: ["textarea.ts"],
    exports: ["UiTextarea"],
    dependencies: ["@gable/core"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "toggle-group",
    files: ["toggle-group.ts"],
    exports: ["ToggleGroupItem", "UiToggleGroup"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: ["toggle"],
    lib: ["cn"],
  },
  {
    name: "toggle",
    files: ["toggle.ts"],
    exports: ["ToggleVariant", "ToggleSize", "toggleVariants", "UiToggle"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["host-class", "variants"],
  },
  {
    name: "tooltip",
    files: ["tooltip.ts"],
    exports: ["UiTooltip"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "placement"],
  },
  {
    name: "virtual-list",
    files: ["virtual-list.ts"],
    exports: ["UiVirtualList"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
  {
    name: "virtual-table",
    files: ["virtual-table.ts"],
    exports: ["UiVirtualTable"],
    dependencies: ["@gable/core", "@gable/ui-primitives"],
    registryDependencies: [],
    lib: ["cn", "host-class"],
  },
];
