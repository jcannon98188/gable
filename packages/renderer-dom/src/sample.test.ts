// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bootstrap } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { dom } from "./index.js";
import { App } from "../sample/app.js";

describe("sample app on the DOM renderer", () => {
  it("boots through bootstrap into #app and reacts to user input", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = bootstrap(App, { renderer: dom(), target: "#app" });
    const host = document.getElementById("app")!;
    expect(app.host).toBe(host);
    expect(host.querySelector("h1")!.textContent).toBe("Gable");
    expect(host.querySelector(".greeting")!.textContent).toBe("Hello world");
    expect([...host.querySelectorAll(".chip")].map((e) => e.textContent)).toEqual(["write", "test"]);
    expect(host.querySelector(".dot")!.namespaceURI).toBe("http://www.w3.org/2000/svg");

    (host.querySelector(".inc") as HTMLElement).click();
    const name = host.querySelector(".name") as HTMLInputElement;
    name.value = "dom";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (host.querySelector(".open") as HTMLElement).click();
    await whenFlushed();
    await whenFlushed();
    expect(host.querySelector(".count")!.textContent).toBe("1");
    expect(host.querySelector(".greeting")!.textContent).toBe("Hello dom");
    expect(host.querySelector(".lazy-click")).not.toBeNull();

    // Scoped: elements of a component's own template carry its token, and its CSS only matches them.
    expect(host.querySelector(".chip")!.hasAttribute("g-Badge")).toBe(true);
    expect(host.hasAttribute("g-App")).toBe(true);
    expect(document.head.querySelector('style[data-gable="Badge"]')!.textContent).toContain(".chip[g-Badge]");

    app.destroy();
    expect(host.querySelector("h1")).toBeNull();
  });

});
