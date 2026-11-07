import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@gable/testing";
import { RouterDemo } from "./router-demo.js";
import { LAZY_DELAY_MS } from "./mini-app.js";

type Fixture = ReturnType<typeof mount>;

const stateOf = (f: Fixture, label: string): string => {
  const dts = f.queryAll(".rd-state dt");
  const dds = f.queryAll(".rd-state dd");
  const i = dts.findIndex((dt) => f.textOf(dt) === label);
  return f.textOf(dds[i]!).trim();
};
const view = (f: Fixture) => f.textOf(f.query(".rd-view")!);
const click = async (f: Fixture, selector: string) => {
  f.dispatch(f.query(selector)!, "click", { button: 0, preventDefault() {} });
  await f.settle();
};
const go = async (f: Fixture, url: string) => {
  f.type(f.query(".rd-addr input")!, url);
  f.dispatch(f.query(".rd-addr")!, "submit", { preventDefault() {} });
  await f.settle();
};
const links = (f: Fixture) => f.queryAll("a");
const linkTo = (f: Fixture, href: string) => links(f).find((a) => a.attrs.href === href)!;

describe("RouterDemo", () => {
  afterEach(() => vi.useRealTimers());

  it("starts at / and redirects to /home, without touching the page URL", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    expect(stateOf(f, "url()")).toBe("/home");
    expect(view(f)).toContain("Home");
    expect(f.queryAll(".rd-state li").map((li) => f.textOf(li)).join("|")).toContain("/home");
    expect(globalThis.location?.pathname ?? "/").not.toContain("home");
  });

  it("navigates nested routes with a param and a query param, and reports them", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    await go(f, "/users/2?tab=posts");
    expect(stateOf(f, "url()")).toBe("/users/2?tab=posts");
    expect(stateOf(f, "params()")).toBe('{"id":"2"}');
    expect(stateOf(f, "queryParams()")).toBe('{"tab":"posts"}');
    expect(view(f)).toContain("Grace Hopper");
    expect(view(f)).toContain("Posts by Grace Hopper");
    const chain = f.textOf(f.query(".rd-state ol")!);
    expect(chain).toContain("mini-users");
    expect(chain).toContain("mini-user>");
  });

  it("keeps the parent and the page instance when only the param changes", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    await go(f, "/users/1");
    const serial = /Page instance #(\d+)/.exec(view(f))![1];
    await click(f, 'a[href="/users/3"]');
    expect(view(f)).toContain("Linus Torvalds");
    expect(/Page instance #(\d+)/.exec(view(f))![1]).toBe(serial);
  });

  it("marks the active link", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    await go(f, "/users/2");
    expect(linkTo(f, "/users").classes).toContain("on");
    expect(linkTo(f, "/home").classes).not.toContain("on");
  });

  it("guards /admin: redirects to /login while signed out, lets you in after signing in", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    await go(f, "/admin");
    expect(stateOf(f, "url()")).toBe("/login?next=admin");
    expect(stateOf(f, "events")).toContain("cancel /admin (redirected)");
    expect(view(f)).toContain("Sign in");
    await click(f, ".rd-view button");
    expect(stateOf(f, "signed in")).toBe("true");
    expect(stateOf(f, "url()")).toBe("/admin");
    expect(view(f)).toContain("The guard let you in");
  });

  it("lets a signed-in visitor straight in", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    await click(f, ".rd-bar > button[aria-pressed]");
    await go(f, "/admin");
    expect(stateOf(f, "url()")).toBe("/admin");
  });

  it("loads the lazy route before committing, with the old page kept meanwhile", async () => {
    vi.useFakeTimers();
    const f = mount(RouterDemo, { advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)) });
    await f.settle();
    void go(f, "/reports");
    await f.flush();
    expect(stateOf(f, "navigating()")).toBe("true");
    expect(f.query(".rd-loading")).toBeTruthy();
    expect(view(f)).toContain("Home");
    expect(stateOf(f, "url()")).toBe("/home");
    await f.advance(LAZY_DELAY_MS + 50);
    // The delay is over; the module import itself takes real time.
    vi.useRealTimers();
    await new Promise((done) => setTimeout(done, 100));
    await f.settle();
    expect(stateOf(f, "navigating()")).toBe("false");
    expect(stateOf(f, "url()")).toBe("/reports");
    expect(view(f)).toContain("separate chunk");
  });

  it("renders the ** route for an unknown URL", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    await go(f, "/nope");
    expect(view(f)).toContain("Nothing matches");
  });

  it("goes back and forward through its own history", async () => {
    const f = mount(RouterDemo);
    await f.settle();
    await go(f, "/users/1");
    await go(f, "/users/2");
    const back = () => f.query('.rd-bar > button[aria-label="Back"]')!;
    const forward = () => f.query('.rd-bar > button[aria-label="Forward"]')!;
    expect(forward().props.disabled).toBeTruthy();
    await click(f, '.rd-bar > button[aria-label="Back"]');
    expect(stateOf(f, "url()")).toBe("/users/1");
    expect(forward().props.disabled).toBeFalsy();
    await click(f, '.rd-bar > button[aria-label="Forward"]');
    expect(stateOf(f, "url()")).toBe("/users/2");
    await click(f, '.rd-bar > button[aria-label="Back"]');
    await click(f, '.rd-bar > button[aria-label="Back"]');
    expect(stateOf(f, "url()")).toBe("/home");
    expect(back().props.disabled).toBeTruthy();
    expect(f.queryAll(".rd-state li.on").length).toBeGreaterThan(0);
  });

  it("two demos do not share a router", async () => {
    const a = mount(RouterDemo);
    const b = mount(RouterDemo);
    await a.settle();
    await b.settle();
    await go(a, "/users/3");
    expect(stateOf(a, "url()")).toBe("/users/3");
    expect(stateOf(b, "url()")).toBe("/home");
  });
});
