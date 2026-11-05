// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bootstrap, html } from "@gable/core";
import { applyUpdate } from "@gable/core/hmr";
import { afterEach } from "vitest";
import { dom } from "./index.js";

// TASK-2.15: focus, selection, scroll and control values survive a template rebuild where the structure matches.


const makePage = () =>
  class Page {
  static meta = {
    selector: "app-page",
    template: html`<form><input class="name" /><textarea class="bio"></textarea><input class="ok" type="checkbox" /><select class="s"><option value="a">a</option><option value="b">b</option></select></form><div class="box">v1</div>`,
  };
  };
const Edited = class Page {
  static meta = {
    selector: "app-page",
    template: html`<form><input class="name" /><textarea class="bio"></textarea><input class="ok" type="checkbox" /><select class="s"><option value="a">a</option><option value="b">b</option></select></form><div class="box">v2</div>`,
  };
};
const Restructured = class Page {
  static meta = {
    selector: "app-page",
    template: html`<section><input class="name" /></section><div class="box">v3</div>`,
  };
};

let apps: Array<{ destroy(): void }> = [];
afterEach(() => {
  apps.forEach((a) => a.destroy());
  apps = [];
});

const start = () => {
  document.body.innerHTML = '<div id="app"></div>';
  const app = bootstrap(makePage(), { renderer: dom(), target: "#app" });
  apps.push(app);
  const q = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
  return { app, q };
};

describe("DOM state across a template rebuild", () => {
  it("keeps focus, selection and typed text of the controls that match", () => {
    const { app, q } = start();
    const name = q<HTMLInputElement>(".name");
    name.value = "hello world";
    name.focus();
    name.setSelectionRange(2, 7);
    q<HTMLTextAreaElement>(".bio").value = "line1\nline2";
    q<HTMLInputElement>(".ok").checked = true;
    q<HTMLSelectElement>(".s").value = "b";
    expect(applyUpdate([{ url: "/page-1.js", exports: { Page: Edited } }], []).status).toBe("applied");
    expect(q(".box").textContent).toBe("v2");
    const next = q<HTMLInputElement>(".name");
    expect(next).not.toBe(name);
    expect(next.value).toBe("hello world");
    expect(document.activeElement).toBe(next);
    expect([next.selectionStart, next.selectionEnd]).toEqual([2, 7]);
    expect(q<HTMLTextAreaElement>(".bio").value).toBe("line1\nline2");
    expect(q<HTMLInputElement>(".ok").checked).toBe(true);
    expect(q<HTMLSelectElement>(".s").value).toBe("b");
  });

  it("restores scroll offsets", () => {
    const { app, q } = start();
    q<HTMLElement>(".box").scrollTop = 40;
    applyUpdate([{ url: "/page-2.js", exports: { Page: Edited } }], []);
    expect(q<HTMLElement>(".box").scrollTop).toBe(40);
  });

  it("restores nothing where the structure no longer matches", () => {
    const { app, q } = start();
    q<HTMLInputElement>(".name").value = "typed";
    q<HTMLInputElement>(".name").focus();
    applyUpdate([{ url: "/page-3.js", exports: { Page: Restructured } }], []);
    expect(q<HTMLInputElement>(".name").value).toBe("");
    expect(document.activeElement).toBe(document.body);
  });

  it("also survives a re-setup of the component (changed class body), not only a template edit", () => {
    const { app, q } = start();
    const name = q<HTMLInputElement>(".name");
    name.value = "kept";
    name.focus();
    const Resetup = class Page {
      static meta = { selector: "app-page", template: html`<form><input class="name" /></form>` };
      added = 1;
    };
    expect(applyUpdate([{ url: "/page-resetup.js", exports: { Page: Resetup } }], []).status).toBe("applied");
    expect(q<HTMLInputElement>(".name")).not.toBe(name);
    expect(q<HTMLInputElement>(".name").value).toBe("kept");
    expect(document.activeElement).toBe(q(".name"));
  });
});
