// The command palette, generated from the current state. Every control outside a modal has a command that runs it or moves to it;
// a modal's fields and an open picker's options are reached through the command that opens them. Selecting one runs it by its
// value, so the template only passes a string.
import { computed, html, inject } from "@gable/core";
import { fuzzyFilter, UiCommandDialog, type CommandItem } from "../components/ui/command.js";
import { TEXT_SCALES } from "../../../src/devices.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import { PageState } from "./page-state.js";
import { ProjectState } from "./project-state.js";
import { TailwindState } from "./tailwind-state.js";

interface Command extends CommandItem {
  run: () => void;
}

export class CommandPalette {
  static meta = {
    selector: "app-command-palette",
    imports: [UiCommandDialog],
    template: html`
      <ui-command-dialog [(open)]="chrome.paletteOpen" [items]="items()" [filter]="filter" heading="Command palette" placeholder="Search or run a command" emptyText="No such command." contentClass="palette" (selected)="run($event)"></ui-command-dialog>
    `,
  };
  chrome = inject(ChromeState);
  state = inject(DesignerState);
  edit = inject(EditState);
  page = inject(PageState);
  tailwind = inject(TailwindState);
  projects = inject(ProjectState);
  filter = fuzzyFilter;

  commands = computed<Command[]>(() => {
    const s = this.state;
    const chrome = this.chrome;
    const frames = s.frames;
    const frame = frames.selected();
    const config = frame.config();
    const out: Command[] = [];
    const cmd = (value: string, label: string, group: string, run: () => void, extra: Partial<CommandItem> = {}) => out.push({ value, label, group, run, ...extra });
    const emulate = (patch: Partial<typeof config.emulation>) => frames.update(config.id, { emulation: { ...config.emulation, ...patch } });

    cmd("mode.component", "Switch to Component mode", "Commands", () => {
      const first = s.sceneFiles()[0];
      if (first) s.showComponent(first);
    }, { disabled: s.sceneFiles().length === 0 });
    cmd("mode.page", "Switch to Page mode", "Commands", () => s.showPage());
    cmd("mode.select", "Select elements on the canvas", "Commands", () => void s.setMode("select"));
    cmd("mode.interact", "Interact with the app on the canvas", "Commands", () => void s.setMode("interact"));
    cmd("edit.undo", "Undo", "Commands", () => void this.edit.undo(), { shortcut: "Ctrl Z", disabled: !this.edit.canUndo() });
    cmd("edit.redo", "Redo", "Commands", () => void this.edit.redo(), { shortcut: "Ctrl Y", disabled: !this.edit.canRedo() });
    cmd("open.browser", "Open in browser", "Commands", () => void frames.openInBrowser().catch(() => undefined));
    cmd("theme.toggle", chrome.dark() ? "Use the light theme" : "Use the dark theme", "Commands", () => chrome.toggleTheme());
    cmd("theme.system", "Follow the system theme", "Commands", () => chrome.theme.set("system"));
    cmd("diagnostics.refresh", "Run the language service again", "Commands", () => void s.refreshDiagnostics());

    cmd("frame.add", "Add frame", "Frames", () => {
      const added = frames.add();
      if (added) s.selectFrame(added.id);
    }, { disabled: frames.frames().length >= 6 });
    cmd("frame.close", "Close the selected frame", "Frames", () => {
      frames.remove(config.id);
      s.selectFrame(frames.selected().id);
    }, { disabled: frames.frames().length <= 1 });
    cmd("frame.rotate", "Rotate the selected frame", "Frames", () => frames.rotate(config.id));
    cmd("frame.sync", frames.sync() ? "Stop syncing interactions" : "Sync interactions between frames", "Frames", () => frames.setSync(!frames.sync()));
    cmd("zoom.fit", "Zoom: fit", "Frames", () => frames.zoom.set("fit"));
    cmd("zoom.50", "Zoom: 50%", "Frames", () => frames.zoom.set(0.5));
    cmd("zoom.75", "Zoom: 75%", "Frames", () => frames.zoom.set(0.75));
    cmd("zoom.100", "Zoom: 100%", "Frames", () => frames.zoom.set(1));
    for (const p of frames.presets()) cmd(`preset.${p.id}`, `Device: ${p.name}`, "Frames", () => frames.applyPreset(config.id, p.id), { keywords: [`${p.width}x${p.height}`] });
    for (const f of frames.frames()) cmd(`frame.select.${f.id}`, `Go to frame ${f.config().name}`, "Frames", () => s.selectFrame(f.id));

    cmd("frame.duplicate", "Duplicate the selected frame", "Frames", () => {
      const added = frames.duplicate(config.id);
      if (added) s.selectFrame(added.id);
    }, { disabled: frames.frames().length >= 6 });
    cmd("preset.delete", "Delete the selected frame's preset", "Frames", () => this.#reach(() => undefined, '[data-part="delete-preset"]', true));
    cmd("frame.size", "Choose a size class", "Frames", () => this.#reach(() => undefined, '[data-part="sizes"] button'));
    cmd("frame.retry", "Retry starting the preview", "Frames", () => this.#press('[data-part="retry"]'));

    cmd("env.touch", config.emulation.touch ? "Stop emulating touch" : "Emulate touch", "Environment", () => emulate({ touch: !config.emulation.touch }));
    cmd("env.motion", config.emulation.reducedMotion ? "Stop emulating reduced motion" : "Emulate reduced motion", "Environment", () => emulate({ reducedMotion: !config.emulation.reducedMotion }));
    cmd("env.scheme.auto", "Color scheme: auto", "Environment", () => emulate({ colorScheme: "auto" }));
    cmd("env.scheme.light", "Color scheme: light", "Environment", () => emulate({ colorScheme: "light" }));
    cmd("env.scheme.dark", "Color scheme: dark", "Environment", () => emulate({ colorScheme: "dark" }));
    for (const scale of TEXT_SCALES) cmd(`env.text.${scale}`, `Text size: ${Math.round(scale * 100)}%`, "Environment", () => emulate({ textScale: scale }), { disabled: (config.emulation.textScale ?? 1) === scale });

    const picked = s.picked();
    const node = this.edit.node();
    const canvas = (action: "parent" | "move-up" | "move-down" | "delete") => () => {
      if (picked) s.canvasAction.set({ action, id: picked.node.id, seq: Date.now() });
    };
    cmd("element.parent", "Select the parent element", "Element", canvas("parent"), { disabled: !picked || picked.chain.length < 2 });
    cmd("element.up", "Move the element up", "Element", canvas("move-up"), { disabled: !node?.prev });
    cmd("element.down", "Move the element down", "Element", canvas("move-down"), { disabled: !node?.next });
    cmd("element.delete", "Delete the element", "Element", canvas("delete"), { disabled: !node });
    const content = () => chrome.right.set("content");
    const style = () => chrome.right.set("style");
    const device = () => undefined;
    const reachable: [string, string, () => void, string, boolean?][] = [
      ["content.text", "Edit the text", content, '[aria-label="Text"],[aria-label="Add text"]'],
      ["content.attr", "Add an attribute", content, '[aria-label="name"]'],
      ["content.bind", "Bind to a signal…", content, '[data-part="bind"]', true],
      ["content.if", "Wrap in a condition", content, '[aria-label="Condition signal"]'],
      ["content.for", "Wrap in a list", content, '[aria-label="List signal"]'],
      ["style.classes", "Add a class", style, '[data-part="palette"] input'],
      ["insert.search", "Search components to insert", () => chrome.left.set("insert"), '[aria-label="Search components"]'],
      ["device.pick", "Choose a device", device, '[aria-label="Device"]'],
      ["device.width", "Set the frame's width", device, '[aria-label="Width"]'],
      ["device.height", "Set the frame's height", device, '[aria-label="Height"]'],
      ["device.dpr", "Set the frame's pixel ratio", device, '[aria-label="DPR"]'],
      ["device.preset", "Save the frame as a preset", device, '[aria-label="Preset name"]'],
    ];
    for (const a of node?.attrs ?? []) {
      if (!a.editable) continue;
      if (a.kind === "static") cmd(`content.attr.edit.${a.name}`, `Edit the attribute ${a.name}`, "Element", () => this.#reach(content, `input[aria-label="${a.name}"]`));
      cmd(`content.attr.remove.${a.name}`, `Remove the attribute ${a.name}`, "Element", () => this.#reach(content, `[aria-label="Remove ${a.name}"]`, true));
    }
    reachable.push(["insert.source", "Choose what to insert from", () => chrome.left.set("insert"), '[data-part="insert-sources"] button'], ["insert.where", "Choose where to insert", () => chrome.left.set("insert"), '[aria-label="Where"]']);
    for (const [value, label, open, selector, press] of reachable) cmd(value, label, "Element", () => this.#reach(open, selector, press));
    if (s.target().kind === "page") {
      cmd("page.reload", "Reload the page", "Element", () => this.#press('[data-part="page-reload"]'));
      cmd("page.back", this.page.backTitle(), "Go to", () => void this.page.back(), { disabled: !this.page.canBack() });
      cmd("page.forward", this.page.forwardTitle(), "Go to", () => void this.page.forward(), { disabled: !this.page.canForward() });
      for (const item of this.page.scenarioItems()) cmd(`page.scenario.${item.value}`, `Page Scenario: ${item.label}`, "Go to", () => this.page.chooseScenario(item.value));
    }
    if (s.target().kind === "page") cmd("page.url", "Go to a URL", "Element", () => this.#reach(device, '[aria-label="URL"]'));

    for (const [value, label] of [["structure", "Structure"], ["insert", "Insert"], ...(s.target().kind === "page" ? [["routes", "Routes"]] : [])] as const) {
      cmd(`left.${value}`, `Show ${label}`, "Panels", () => chrome.left.set(value));
    }
    for (const [value, label] of [["style", "Style"], ["content", "Content"], ["inspector", "Inspector"]] as const) {
      cmd(`right.${value}`, `Show ${label}`, "Panels", () => chrome.right.set(value));
    }
    for (const [value, label] of [["code", "Code"], ["problems", "Problems"], ["hmr", "HMR timeline"], ["state", "State timeline"], ["why", "Why updated"], ["a11y", "Accessibility"], ["perf", "Performance"], ["http", "Network"], ["storage", "Storage"], ["matrix", "Matrix"]] as const) {
      cmd(`drawer.${value}`, `Show ${label} in the drawer`, "Panels", () => chrome.showDrawer(value));
    }
    for (const f of ["all", "error", "warning"]) {
      cmd(`problems.filter.${f}`, `Problems: show ${f === "all" ? "all" : `${f}s`}`, "Panels", () => this.#reach(() => chrome.showDrawer("problems"), `[data-problems-filter="${f}"]`, true));
    }
    for (const d of s.analysis()?.diagnostics ?? []) {
      const fix = d.fixes?.[0];
      if (fix) cmd(`problems.fix.${d.id}`, `Fix: ${fix.title}`, "Panels", () => void this.edit.fix(d.id, 0), { keywords: [d.rule, s.relative(d.file)], disabled: this.edit.busy() });
    }
    cmd("hmr.clear", "Clear the HMR timeline", "Panels", () => this.#reach(() => chrome.showDrawer("hmr"), '[data-part="hmr-clear"]', true));
    cmd("drawer.toggle", chrome.drawerOpen() ? "Collapse the drawer" : "Open the drawer", "Panels", () => chrome.toggleDrawer());

    cmd("dialog.open", "Open a project…", "Dialogs", () => chrome.dialog.set("open-project"));
    cmd("dialog.connect", "Connect to dev server…", "Dialogs", () => chrome.dialog.set("connect"));
    cmd("dialog.server-log", "Show the dev server log", "Dialogs", () => chrome.dialog.set("server-log"));
    cmd("server.restart", "Restart the dev server", "Dialogs", () => void this.projects.restart(), { disabled: this.projects.installing() });
    if (this.projects.canInstall()) cmd("server.install", "Install the project's dependencies and start", "Dialogs", () => void this.projects.install(), { disabled: this.projects.installing() });
    cmd("dialog.extract", "Extract to component…", "Dialogs", () => chrome.dialog.set("extract"));
    cmd("dialog.rename", "Rename component…", "Dialogs", () => chrome.dialog.set("rename"));
    cmd("dialog.find-uses", "Find uses…", "Dialogs", () => chrome.dialog.set("find-uses"));
    cmd("dialog.scenario", "New Scenario…", "Dialogs", () => chrome.dialog.set("new-scenario"));
    if (s.target().kind === "page") cmd("route.add", "Add route…", "Dialogs", () => this.#addRoute(), { disabled: this.page.config() === null });

    for (const b of [{ name: "base" }, ...this.tailwind.breakpoints()]) {
      cmd(`style.breakpoint.${b.name}`, `Write at the ${b.name} breakpoint`, "Style", () => this.tailwind.pin(b.name));
    }
    for (const c of this.tailwind.enabled()?.controls ?? []) {
      cmd(`style.control.${c.id}`, `Style: ${c.label}`, "Style", () => this.#reach(() => chrome.right.set("style"), `[data-control="${c.id}"]`, true), { disabled: !node });
    }
    for (const t of this.tailwind.analysis()?.tokens ?? []) {
      cmd(`style.remove.${t.token}`, `Remove the class ${t.token}`, "Style", () => void this.tailwind.remove(t.token), { disabled: !this.tailwind.writable() });
    }
    for (const state of this.tailwind.enabled()?.states ?? []) {
      const on = this.tailwind.states().includes(state);
      cmd(`style.state.${state}`, `${on ? "Stop forcing" : "Force"} the ${state} state`, "Style", () => this.tailwind.states.update((all) => (on ? all.filter((x) => x !== state) : [...all, state])));
    }

    for (const file of s.sceneFiles()) cmd(`goto.file.${file}`, `Go to ${file}`, "Go to", () => s.showComponent(file));
    for (const scene of s.sceneInfo()?.scenes ?? []) cmd(`goto.scene.${scene.name}`, `Go to Scenario ${scene.name}`, "Go to", () => void s.chooseScene(scene.name));
    for (const n of s.tree()) cmd(`goto.component.${n.id}`, `Go to component ${n.name}`, "Go to", () => void s.selectComponent(n.id), { keywords: [n.selector] });
    if (s.target().kind === "page") {
      for (const r of this.page.rows()) {
        if (!r.url.includes(":")) cmd(`goto.route.${r.key}.${r.path}`, `Go to route ${r.url}`, "Go to", () => void this.page.navigate(r.url));
        const at = r.at;
        if (at) cmd(`route.edit.${r.key}.${r.path}`, `Edit route ${r.url}`, "Dialogs", () => this.page.openForm({ mode: "edit", at }));
      }
    }
    return out;
  });
  items = computed<CommandItem[]>(() => this.commands().map(({ run: _run, ...item }) => item));

  /** Opens a panel, then moves to one of its controls (or presses it) once the palette has handed focus back. */
  #reach(open: () => void, selector: string, press = false): void {
    open();
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(selector);
      el?.focus();
      if (press) el?.click();
    }, 120);
  }

  /** Presses a control that is on screen, once the palette has handed focus back. */
  #press(selector: string): void {
    this.#reach(() => undefined, selector, true);
  }

  #addRoute(): void {
    this.page.openForm({ mode: "add", parent: [] });
    this.chrome.left.set("routes");
  }

  run(value: string): void {
    this.chrome.paletteOpen.set(false);
    this.commands().find((c) => c.value === value)?.run();
  }
}
