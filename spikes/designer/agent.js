// THROWAWAY SPIKE. Runs inside the preview iframe (injected by project.vite.mjs). Talks to the shell over postMessage.
// It owns no framework logic: it rides on core's devtools hook (`__GABLE_DEVTOOLS_HOOK__`) and adds click-to-pick.
(() => {
  const post = (msg) => parent !== window && parent.postMessage({ __gable: 1, ...msg }, "*");
  let pickMode = true;
  let hook;

  const sendTree = () => post({ type: "tree", tree: hook.call("tree") });
  let queued = false;
  const queueTree = () => queued || ((queued = true), setTimeout(() => ((queued = false), sendTree()), 50));

  function start(h) {
    hook = h;
    post({ type: "ready", hello: hook.call("hello") });
    sendTree();
    hook.connect((e) => (e.type === "tree" || e.type === "hmr") && queueTree());
    installPicker();
  }

  function installPicker() {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #e0457b;background:#e0457b22;display:none";
    document.documentElement.append(box);
    const outline = (el) => {
      if (!el) return void (box.style.display = "none");
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    };
    const describe = (el) => {
      const src = hook.templateSourceOf(el);
      const cid = hook.componentFor(el);
      const detail = cid ? hook.call("component", { id: cid }) : null;
      return {
        tag: el.tagName.toLowerCase(),
        // innermost component whose host contains the element (the DOM-walk owner), may differ from the template author
        hostComponent: detail && { id: detail.id, name: detail.name, source: detail.source },
        template: src, // null for elements not built from a template (e.g. an app root host)
      };
    };
    document.addEventListener("mouseover", (e) => pickMode && outline(e.target), true);
    document.addEventListener("mouseout", () => pickMode && outline(null), true);
    // Capture phase + stopPropagation: the app never sees the click in design mode.
    for (const type of ["click", "dblclick", "mousedown", "mouseup", "keydown"]) {
      document.addEventListener(
        type,
        (e) => {
          if (!pickMode) return;
          if (type === "keydown") return; // keep keyboard alive
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (type === "click") post({ type: "pick", ...describe(e.target) });
        },
        true,
      );
    }
    addEventListener("message", (e) => {
      const m = e.data;
      if (!m || !m.__gable) return;
      if (m.type === "mode") pickMode = !!m.pick;
      if (m.type === "highlight") outline(m.id ? hook.element(m.id) : null);
    });
  }

  const existing = globalThis.__GABLE_DEVTOOLS_HOOK__;
  if (existing) start(existing);
  else addEventListener("gable:devtools-ready", () => start(globalThis.__GABLE_DEVTOOLS_HOOK__), { once: true });
})();
