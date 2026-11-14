import { describe, expect, it } from "vitest";
import { createWorkerScope, type Network } from "../testing/worker-scope.js";
import { createFetchRouter } from "./router.js";

const reply = (body: string) => () => new Response(body);

async function activated(network?: Network) {
  const scope = createWorkerScope({ network: network ?? ((request) => new Response(`network ${request.url}`)) });
  await scope.install();
  await scope.activate();
  return scope;
}

const text = async (response: Promise<Response>) => (await response).text();

describe("fetch router: URL patterns", () => {
  it("a path pattern matches same-origin paths, with :params and * wildcards", async () => {
    const scope = await activated();
    const seen: Record<string, string>[] = [];
    createFetchRouter(scope)
      .route("/users/:id/posts/:post", ({ params }) => {
        seen.push(params);
        return new Response("post");
      })
      .route("/assets/*", reply("asset"))
      .listen();
    expect(await text(scope.dispatchFetch("/users/7/posts/hello?x=1"))).toBe("post");
    expect(seen).toEqual([{ id: "7", post: "hello" }]);
    expect(await text(scope.dispatchFetch("/assets/img/logo.png"))).toBe("asset");
    // :id is one segment, the pattern matches the whole path, and other origins do not match a path pattern.
    expect(await text(scope.dispatchFetch("/users/7/posts/hello/extra"))).toBe("network https://app.test/users/7/posts/hello/extra");
    expect(await text(scope.dispatchFetch("/assets"))).toBe("network https://app.test/assets");
    expect(await text(scope.dispatchFetch("https://cdn.test/assets/a.js"))).toBe("network https://cdn.test/assets/a.js");
  });

  it("an absolute pattern matches another origin", async () => {
    const scope = await activated();
    createFetchRouter(scope).route("https://fonts.test/*", reply("font")).listen();
    expect(await text(scope.dispatchFetch("https://fonts.test/inter.woff2"))).toBe("font");
    expect(await text(scope.dispatchFetch("https://other.test/inter.woff2"))).toBe("network https://other.test/inter.woff2");
  });

  it("regular-expression characters in a pattern are literal", async () => {
    const scope = await activated();
    createFetchRouter(scope).route("/app.js", reply("app")).listen();
    expect(await text(scope.dispatchFetch("/app.js"))).toBe("app");
    expect(await text(scope.dispatchFetch("/appXjs"))).toBe("network https://app.test/appXjs");
  });

  it("a RegExp is tested against the full URL and its named groups become params", async () => {
    const scope = await activated();
    createFetchRouter(scope)
      .route(/\/api\/v(?<version>\d+)\//, ({ params }) => new Response(`api ${params.version}`))
      .listen();
    expect(await text(scope.dispatchFetch("/api/v2/items?page=3"))).toBe("api 2");
  });

  it("a predicate receives the URL and the request", async () => {
    const scope = await activated();
    createFetchRouter(scope)
      .route((url, request) => url.searchParams.has("live") && request.headers.get("accept") === "text/event-stream", reply("live"))
      .listen();
    expect(await text(scope.dispatchFetch("/feed?live", { headers: { accept: "text/event-stream" } }))).toBe("live");
    expect(await text(scope.dispatchFetch("/feed?live"))).toBe("network https://app.test/feed?live");
  });

  it("the first matching route answers", async () => {
    const scope = await activated();
    createFetchRouter(scope).route("/a/special", reply("special")).route("/a/*", reply("general")).listen();
    expect(await text(scope.dispatchFetch("/a/special"))).toBe("special");
    expect(await text(scope.dispatchFetch("/a/other"))).toBe("general");
  });
});

describe("fetch router: method and destination", () => {
  it("routes GET requests unless a method is given", async () => {
    const scope = await activated();
    createFetchRouter(scope)
      .route("/form", reply("read"))
      .route("/form", reply("written"), { method: ["post", "PUT"] })
      .route("/any", reply("any"), { method: "*" })
      .listen();
    expect(await text(scope.dispatchFetch("/form"))).toBe("read");
    expect(await text(scope.dispatchFetch("/form", { method: "POST", body: "x" }))).toBe("written");
    expect(await text(scope.dispatchFetch("/form", { method: "PUT", body: "x" }))).toBe("written");
    expect(await text(scope.dispatchFetch("/form", { method: "DELETE" }))).toBe("network https://app.test/form");
    expect(await text(scope.dispatchFetch("/any", { method: "DELETE" }))).toBe("any");
  });

  it("routes by request destination", async () => {
    const scope = await activated();
    createFetchRouter(scope)
      .route("/*", reply("page"), { destination: "document" })
      .route("/*", reply("media"), { destination: ["image", "video"] })
      .listen();
    expect(await text(scope.dispatchFetch("/about", { mode: "navigate" }))).toBe("page");
    expect(await text(scope.dispatchFetch("/cat.png", { destination: "image" }))).toBe("media");
    expect(await text(scope.dispatchFetch("/cat.mp4", { destination: "video" }))).toBe("media");
    expect(await text(scope.dispatchFetch("/app.js", { destination: "script" }))).toBe("network https://app.test/app.js");
  });
});

describe("fetch router: handling", () => {
  it("handle() reports whether a route answered, and unmatched requests are left alone", async () => {
    const scope = await activated();
    const router = createFetchRouter(scope).route("/mine", reply("mine"));
    const answered: boolean[] = [];
    scope.addEventListener("fetch", (event) => answered.push(router.handle(event)));
    expect(await text(scope.dispatchFetch("/mine"))).toBe("mine");
    expect(await text(scope.dispatchFetch("/theirs"))).toBe("network https://app.test/theirs");
    expect(answered).toEqual([true, false]);
  });

  it("hands the handler the event, request, URL and scope", async () => {
    const scope = await activated();
    createFetchRouter(scope)
      .route("/ctx", (context) => {
        expect(context.scope).toBe(scope);
        expect(context.request).toBe(context.event.request);
        return new Response(`${context.url.pathname} ${context.event.clientId}`);
      })
      .listen();
    expect(await text(scope.dispatchFetch("/ctx", { clientId: "tab-1" }))).toBe("/ctx tab-1");
  });

  it("a handler that throws or rejects is a network error, not a fall-through", async () => {
    const scope = await activated();
    createFetchRouter(scope)
      .route("/throws", () => {
        throw new Error("boom");
      })
      .route("/rejects", async () => {
        throw new Error("boom");
      })
      .listen();
    await expect(scope.dispatchFetch("/throws")).rejects.toThrow(TypeError);
    await expect(scope.dispatchFetch("/rejects")).rejects.toThrow(TypeError);
  });

  it("listen() returns a function that stops routing", async () => {
    const scope = await activated();
    const stop = createFetchRouter(scope).route("/x", reply("routed")).listen();
    expect(await text(scope.dispatchFetch("/x"))).toBe("routed");
    stop();
    expect(await text(scope.dispatchFetch("/x"))).toBe("network https://app.test/x");
  });
});
