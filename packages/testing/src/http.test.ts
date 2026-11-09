import { afterEach, describe, expect, it, vi } from "vitest";
import { Observable, firstValueFrom, map, of } from "rxjs";
import { createInjector, html, inject, type Provider } from "@gable/core";
import { toSignal } from "@gable/core/rxjs";
import { Http, HttpBackend, HttpError, mockHttp, withInterceptors, type HttpInterceptor, type HttpMock } from "@gable/core/http";
import { createTestInjector, httpTesting, mount } from "@gable/testing";

function setup(providers: Provider[] = []) {
  const injector = createTestInjector(providers);
  return { injector, http: injector.run(() => inject(Http)), fake: httpTesting(injector) };
}

const caught = (source: Observable<unknown>) => firstValueFrom(source).then(() => undefined, (e: unknown) => e);

describe("requests (recording fake)", () => {
  it("is cold: nothing is sent until subscribe, and the default result is the parsed body", async () => {
    const { http, fake } = setup();
    const result = http.get<{ id: number }>("/api/user");
    fake.expectNone("/api/user");
    const pending = firstValueFrom(result);
    fake.expectOne("/api/user").respond({ id: 7 });
    expect(await pending).toEqual({ id: 7 });
  });

  it("sends method, params, headers and body; matches by method and url", () => {
    const { http, fake } = setup();
    http.post("/items", { name: "a" }, { params: { q: "x y", n: 2 }, headers: { "X-A": "1" } }).subscribe();
    http.get("/items").subscribe();
    expect(() => fake.expectOne("/items")).toThrow(/found 2/);
    const post = fake.expectOne({ method: "POST", url: "/items" });
    expect(post.request.body).toEqual({ name: "a" });
    expect(post.request.params).toEqual({ q: "x y", n: 2 });
    expect(post.request.headers).toEqual({ "X-A": "1" });
    expect(fake.match((r) => r.method === "GET")).toHaveLength(1);
  });

  it("supports put, patch, delete and request()", () => {
    const { http, fake } = setup();
    http.put("/a", 1).subscribe();
    http.patch("/a", 1).subscribe();
    http.delete("/a").subscribe();
    http.request({ method: "HEAD", url: "/a" }).subscribe();
    expect(fake.match("/a").map((r) => r.request.method)).toEqual(["PUT", "PATCH", "DELETE", "HEAD"]);
  });

  it("returns the full response with observe: 'response'", async () => {
    const { http, fake } = setup();
    const pending = firstValueFrom(http.get("/r", { observe: "response", responseType: "text" }));
    fake.expectOne("/r").respond("hi", { status: 201, statusText: "Created", headers: { etag: "x" } });
    expect(await pending).toEqual({ body: "hi", status: 201, statusText: "Created", url: "/r", headers: { etag: "x" } });
  });

  it("errors with a typed HttpError for non-2xx responses", async () => {
    const { http, fake } = setup();
    const pending = caught(http.get("/missing"));
    fake.expectOne("/missing").respond({ why: "gone" }, { status: 404, statusText: "Not Found" });
    const error = (await pending) as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ kind: "status", status: 404, statusText: "Not Found", url: "/missing", body: { why: "gone" } });
  });

  it("errors with kind 'network' on a network failure", async () => {
    const { http, fake } = setup();
    const pending = caught(http.get("/x"));
    fake.expectOne("/x").networkError();
    expect(await pending).toMatchObject({ kind: "network", status: 0 });
  });

  it("aborts without an error when unsubscribed", () => {
    const { http, fake } = setup();
    const errors: unknown[] = [];
    const sub = http.get("/slow").subscribe({ error: (e) => errors.push(e) });
    const req = fake.expectOne("/slow");
    expect(req.cancelled).toBe(false);
    sub.unsubscribe();
    expect(req.cancelled).toBe(true);
    expect(errors).toEqual([]);
    fake.verify(); // a cancelled request is not outstanding
  });

  it("each subscription sends its own request", () => {
    const { http, fake } = setup();
    const r = http.get("/twice");
    r.subscribe();
    r.subscribe();
    expect(fake.match("/twice")).toHaveLength(2);
  });

  it("verify() fails while a request is outstanding", () => {
    const { http, fake } = setup();
    http.get("/open").subscribe();
    expect(() => fake.verify()).toThrow(/\/open/);
  });
});

describe("interceptors", () => {
  const tag =
    (name: string, log: string[]): HttpInterceptor =>
    (req, next) => {
      log.push(name);
      return next({ ...req, headers: { ...req.headers, [`x-${name}`]: "1" } });
    };

  it("run outer to inner by injector depth and see immutable, replaced requests", () => {
    const log: string[] = [];
    const root = createTestInjector(withInterceptors([tag("a", log), tag("b", log)]));
    const child = root.createChild(withInterceptors([tag("c", log)]));
    const original = { method: "GET", url: "/z" } as const;
    child.run(() => inject(Http)).request(original).subscribe();
    expect(log).toEqual(["a", "b", "c"]);
    const sent = httpTesting(root).expectOne("/z").request;
    expect(sent.headers).toEqual({ "x-a": "1", "x-b": "1", "x-c": "1" });
    expect(original).toEqual({ method: "GET", url: "/z" });
    // The root's own Http is unaffected by the child layer.
    log.length = 0;
    root.run(() => inject(Http)).get("/y").subscribe();
    expect(log).toEqual(["a", "b"]);
  });

  it("run in the injection context", () => {
    class Credentials {
      static scope = "root";
      value = "secret";
    }
    const auth: HttpInterceptor = (req, next) => next({ ...req, headers: { ...req.headers, auth: inject(Credentials).value } });
    const { http, fake } = setup(withInterceptors([auth]));
    http.get("/a").subscribe();
    expect(fake.expectOne("/a").request.headers).toEqual({ auth: "secret" });
  });

  it("can short-circuit and map responses", async () => {
    const stub: HttpInterceptor = (req, next) =>
      req.url === "/stubbed" ? of({ status: 200, statusText: "OK", url: req.url, headers: {}, body: "from interceptor" }) : next(req);
    const upper: HttpInterceptor = (req, next) => next(req).pipe(map((r) => ({ ...r, body: String(r.body).toUpperCase() })));
    const { http, fake } = setup(withInterceptors([upper, stub]));
    expect(await firstValueFrom(http.get("/stubbed", { responseType: "text" }))).toBe("FROM INTERCEPTOR");
    fake.expectNone("/stubbed");
    const pending = firstValueFrom(http.get("/t", { responseType: "text" }));
    fake.expectOne("/t").respond("abc");
    expect(await pending).toBe("ABC");
  });
});

describe("harness integration", () => {
  it("fails at teardown when a request was never matched", () => {
    class Page {
      static meta = { selector: "app-page", template: html`<p></p>` };
      http = inject(Http);
      data = toSignal(this.http.get("/never"));
    }
    const f = mount(Page);
    expect(() => f.destroy()).toThrow(/\/never/);
  });

  it("passes teardown when every request was matched or cancelled", async () => {
    class Page {
      static meta = { selector: "app-page", template: html`<p>{{ data() }}</p>` };
      data = toSignal(inject(Http).get<string>("/ok", { responseType: "text" }), { initialValue: "..." });
    }
    const f = mount(Page);
    f.http.expectOne("/ok").respond("loaded");
    await f.flush();
    expect(f.text()).toBe("loaded");
    expect(() => f.destroy()).not.toThrow();
  });

  it("sends an HttpError from a bound request to the ErrorHandler", async () => {
    class Page {
      static meta = { selector: "app-page", template: html`<p></p>` };
      data = toSignal(inject(Http).get("/bad"));
    }
    const f = mount(Page);
    f.http.expectOne("/bad").respond(null, { status: 500, statusText: "Server Error" });
    await f.flush().catch(() => {});
    const [report] = f.claimErrors();
    expect(report!.context.source).toBe("subscription");
    expect(report!.error).toBeInstanceOf(HttpError);
    f.destroy();
  });

  it("lets a test replace the HttpBackend Token", () => {
    class Stub extends HttpBackend {
      override handle() {
        return of();
      }
    }
    const injector = createTestInjector([{ provide: HttpBackend, useClass: Stub }]);
    expect(injector.run(() => inject(HttpBackend))).toBeInstanceOf(Stub);
  });
});

describe("default fetch backend", () => {
  afterEach(() => vi.unstubAllGlobals());
  // HttpBackend itself is the fetch default; this test injector skips the recording fake.
  const real = () => createTestInjector([{ provide: HttpBackend, useClass: HttpBackend }]).run(() => inject(Http));

  it("sends JSON, builds the query string, parses the body", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = await firstValueFrom(real().post("/p", { a: 1 }, { params: { q: "x y", tags: ["a", "b"] } }));
    expect(body).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/p?q=x+y&tags=a&tags=b");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("sends JSON on a host without FormData or Blob (Gable Native's globals)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("FormData", undefined);
    vi.stubGlobal("Blob", undefined);
    expect(await firstValueFrom(real().post("/p", { a: 1 }))).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![1].body).toBe('{"a":1}');
  });

  it("maps non-2xx, network and parse failures to HttpError kinds", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 503, statusText: "Unavailable" }));
    expect(await caught(real().get("/s", { responseType: "text" }))).toMatchObject({ kind: "status", status: 503, body: "nope" });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("failed to fetch");
    });
    expect(await caught(real().get("/n"))).toMatchObject({ kind: "network" });
    vi.stubGlobal("fetch", async () => new Response("not json", { status: 200 }));
    expect(await caught(real().get("/j"))).toMatchObject({ kind: "parse", status: 200 });
  });

  it("aborts the fetch on unsubscribe, without an error", async () => {
    let signal!: AbortSignal;
    vi.stubGlobal(
      "fetch",
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          signal = init.signal!;
          signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        }),
    );
    const errors: unknown[] = [];
    const sub = real().get("/slow").subscribe({ error: (e) => errors.push(e) });
    sub.unsubscribe();
    await new Promise((r) => setTimeout(r, 0));
    expect(signal.aborted).toBe(true);
    expect(errors).toEqual([]);
  });

  it("errors with kind 'abort' when the caller's own signal aborts", async () => {
    vi.stubGlobal(
      "fetch",
      (_u: string, init: RequestInit) =>
        new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("a", "AbortError")))),
    );
    const ctl = new AbortController();
    const pending = caught(real().get("/s", { signal: ctl.signal }));
    ctl.abort();
    expect(await pending).toMatchObject({ kind: "abort" });
  });
});

describe("mockHttp (declarative mocks)", () => {
  const run = (mocks: HttpMock[], call: (http: Http) => Observable<unknown>, options?: Parameters<typeof mockHttp>[1]) => {
    const injector = createInjector([...mockHttp(mocks, options)]);
    return injector.run(() => call(inject(Http)));
  };

  it("answers by method and url (exact, prefix and RegExp); first match wins", async () => {
    const mocks: HttpMock[] = [
      { method: "GET", url: "/api/todos", reply: { body: [1, 2] } },
      { url: "/api/users/*", reply: (req) => ({ body: { url: req.url } }) },
      { url: /\/search\?q=ab/, reply: { body: "found" } },
    ];
    expect(await firstValueFrom(run(mocks, (h) => h.get("/api/todos?x=1")))).toEqual([1, 2]);
    expect(await firstValueFrom(run(mocks, (h) => h.get("/api/users/7")))).toEqual({ url: "/api/users/7" });
    expect(await firstValueFrom(run(mocks, (h) => h.get("/search", { params: { q: "ab" } })))).toBe("found");
  });

  it("maps a non-2xx status to an HttpError, supports errors and delays, and 404s an unmatched request", async () => {
    const seen: string[] = [];
    const options = { onRequest: (e: { method: string; url: string; mock: number; outcome: string }) => seen.push(`${e.method} ${e.url} ${e.mock} ${e.outcome}`) };
    const mocks: HttpMock[] = [
      { url: "/fail", reply: { status: 500, body: "x" } },
      { url: "/down", reply: { error: "network" } },
      { url: "/slow", reply: { body: "late", delay: 20 } },
    ];
    const boom = (await caught(run(mocks, (h) => h.get("/fail"), options))) as HttpError;
    expect([boom.kind, boom.status, boom.body]).toEqual(["status", 500, "x"]);
    expect(((await caught(run(mocks, (h) => h.get("/down"), options))) as HttpError).kind).toBe("network");
    expect(await firstValueFrom(run(mocks, (h) => h.get("/slow"), options))).toBe("late");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(((await caught(run(mocks, (h) => h.get("/nothing"), options))) as HttpError).status).toBe(404);
    warn.mockRestore();
    expect(seen).toEqual(["GET /fail 0 500", "GET /down 1 network", "GET /slow 2 200", "GET /nothing -1 404"]);
  });
});
