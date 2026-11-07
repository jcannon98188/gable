// `@gable/core/http`: a small HTTP client. Requests are cold Observables that
// send on subscribe and abort on unsubscribe; this entry imports RxJS (a peer dependency).
import { Observable, map, type Subscriber } from "rxjs";
import { INJECTOR, inject, type Injector, type Provider } from "./di.js";

export type HttpResponseType = "json" | "text" | "blob" | "arraybuffer";
export type HttpParamValue = string | number | boolean;
export type HttpParams = Record<string, HttpParamValue | readonly HttpParamValue[]>;

/** An immutable request. Interceptors replace it with a modified copy. */
export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly params?: HttpParams;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly responseType?: HttpResponseType;
  /** Aborting it errors the request with kind "abort"; unsubscribing aborts silently. */
  readonly signal?: AbortSignal;
}

export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: T;
}

export interface HttpOptions {
  params?: HttpParams;
  headers?: Record<string, string>;
  responseType?: HttpResponseType;
  signal?: AbortSignal;
}
export interface HttpBodyOptions extends HttpOptions {
  observe?: "body";
}
export interface HttpResponseOptions extends HttpOptions {
  observe: "response";
}

export type HttpErrorKind = "status" | "network" | "abort" | "parse";

/** Every failure of a request: a non-2xx status, a network failure, an abort by the caller's signal, or an unparseable body. */
export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  constructor(
    kind: HttpErrorKind,
    init: { url: string; status?: number; statusText?: string; body?: unknown; headers?: Readonly<Record<string, string>>; cause?: unknown },
  ) {
    super(
      kind === "status" ? `HTTP ${init.status} ${init.statusText ?? ""} for ${init.url}`.replace(/ +/g, " ") : `HTTP ${kind} error for ${init.url}`,
      { cause: init.cause },
    );
    this.name = "HttpError";
    this.kind = kind;
    this.status = init.status ?? 0;
    this.statusText = init.statusText ?? "";
    this.url = init.url;
    this.body = init.body;
    this.headers = init.headers ?? {};
  }
}

export type HttpHandler = (req: HttpRequest) => Observable<HttpResponse>;

/** A plain function run in the injection context of the injector that provided it. */
export type HttpInterceptor = (req: HttpRequest, next: HttpHandler) => Observable<HttpResponse>;

/**
 * The Token under the interceptors. This default sends with `fetch`; tests and
 * special environments replace it with a provider. A backend emits every
 * response it receives (status errors are mapped above it) and aborts on unsubscribe.
 */
export class HttpBackend {
  static scope = "root";
  handle(req: HttpRequest): Observable<HttpResponse> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      let external = false;
      const onAbort = () => {
        external = true;
        controller.abort();
      };
      if (req.signal?.aborted) onAbort();
      req.signal?.addEventListener("abort", onAbort);
      void send(req, controller.signal, subscriber, () => external);
      return () => {
        req.signal?.removeEventListener("abort", onAbort);
        controller.abort();
      };
    });
  }
}

function buildUrl(url: string, params: HttpParams | undefined): string {
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) search.append(key, String(v));
  }
  const query = search.toString();
  if (!query) return url;
  return url + (url.includes("?") ? "&" : "?") + query;
}

function encodeBody(body: unknown, headers: Record<string, string>): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams
  ) {
    return body;
  }
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
  return JSON.stringify(body);
}

async function send(
  req: HttpRequest,
  signal: AbortSignal,
  subscriber: Subscriber<HttpResponse>,
  externallyAborted: () => boolean,
): Promise<void> {
  const url = buildUrl(req.url, req.params);
  const headers = { ...req.headers };
  let response: Response;
  try {
    const init: RequestInit = { method: req.method, headers, signal };
    const body = encodeBody(req.body, headers);
    if (body !== undefined) init.body = body;
    response = await fetch(url, init);
  } catch (cause) {
    if (subscriber.closed) return; // unsubscribed: an abort is not an error
    const aborted = externallyAborted() || (cause as { name?: string } | null)?.name === "AbortError";
    subscriber.error(new HttpError(aborted ? "abort" : "network", { url, cause }));
    return;
  }
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => (responseHeaders[key] = value));
  const meta = { url, status: response.status, statusText: response.statusText, headers: responseHeaders };
  try {
    const type = req.responseType ?? "json";
    let body: unknown;
    if (type === "text") body = await response.text();
    else if (type === "blob") body = await response.blob();
    else if (type === "arraybuffer") body = await response.arrayBuffer();
    else {
      const text = await response.text();
      // Error bodies are best-effort: a non-JSON error page stays text. Success bodies must parse.
      try {
        body = text === "" ? null : JSON.parse(text);
      } catch (cause) {
        if (!response.ok) body = text;
        else throw cause;
      }
    }
    if (!subscriber.closed) {
      subscriber.next({ ...meta, body });
      subscriber.complete();
    }
  } catch (cause) {
    if (subscriber.closed) return;
    const aborted = externallyAborted() || (cause as { name?: string } | null)?.name === "AbortError";
    subscriber.error(new HttpError(aborted ? "abort" : "parse", { ...meta, cause }));
  }
}

interface Layer {
  fn: HttpInterceptor;
  injector: Injector;
}

function checkStatus(res: HttpResponse): HttpResponse {
  if (res.status >= 200 && res.status < 300) return res;
  throw new HttpError("status", res);
}

/**
 * The HTTP client. Resolve it with `inject(Http)`; it layers the interceptors
 * of every injector from the root down to the one it was resolved in.
 */
export class Http {
  static scope = "root";
  /** @internal */ injector = inject(INJECTOR);
  /** @internal */ backend = inject(HttpBackend);
  /** @internal */ layers: Layer[] = [];

  request<T = unknown>(req: HttpRequest & { observe?: "body" }): Observable<T>;
  request<T = unknown>(req: HttpRequest & { observe: "response" }): Observable<HttpResponse<T>>;
  request(req: HttpRequest & { observe?: "body" | "response" }): Observable<unknown>;
  request(req: HttpRequest & { observe?: "body" | "response" }): Observable<unknown> {
    const { observe, ...request } = req;
    return new Observable<unknown>((subscriber) => {
      const terminal: HttpHandler = (r) => this.backend.handle(r).pipe(map(checkStatus));
      const chain = this.layers.reduceRight<HttpHandler>(
        (next, layer) => (r) => layer.injector.run(() => layer.fn(r, next)),
        terminal,
      );
      return chain(request)
        .pipe(map((res) => (observe === "response" ? res : res.body)))
        .subscribe(subscriber);
    });
  }

  get<T = unknown>(url: string, options?: HttpBodyOptions): Observable<T>;
  get<T = unknown>(url: string, options: HttpResponseOptions): Observable<HttpResponse<T>>;
  get(url: string, options: HttpBodyOptions | HttpResponseOptions = {}): Observable<unknown> {
    return this.request({ ...options, method: "GET", url });
  }
  delete<T = unknown>(url: string, options?: HttpBodyOptions): Observable<T>;
  delete<T = unknown>(url: string, options: HttpResponseOptions): Observable<HttpResponse<T>>;
  delete(url: string, options: HttpBodyOptions | HttpResponseOptions = {}): Observable<unknown> {
    return this.request({ ...options, method: "DELETE", url });
  }
  post<T = unknown>(url: string, body?: unknown, options?: HttpBodyOptions): Observable<T>;
  post<T = unknown>(url: string, body: unknown, options: HttpResponseOptions): Observable<HttpResponse<T>>;
  post(url: string, body?: unknown, options: HttpBodyOptions | HttpResponseOptions = {}): Observable<unknown> {
    return this.request({ ...options, method: "POST", url, body });
  }
  put<T = unknown>(url: string, body?: unknown, options?: HttpBodyOptions): Observable<T>;
  put<T = unknown>(url: string, body: unknown, options: HttpResponseOptions): Observable<HttpResponse<T>>;
  put(url: string, body?: unknown, options: HttpBodyOptions | HttpResponseOptions = {}): Observable<unknown> {
    return this.request({ ...options, method: "PUT", url, body });
  }
  patch<T = unknown>(url: string, body?: unknown, options?: HttpBodyOptions): Observable<T>;
  patch<T = unknown>(url: string, body: unknown, options: HttpResponseOptions): Observable<HttpResponse<T>>;
  patch(url: string, body?: unknown, options: HttpBodyOptions | HttpResponseOptions = {}): Observable<unknown> {
    return this.request({ ...options, method: "PATCH", url, body });
  }
}

/**
 * Providers adding interceptors at one injector (the app, a Route, a component).
 * They run after the interceptors of the injectors above, outer to inner, and
 * each in its own injector's context. Pass every interceptor of that injector in one array.
 */
export function withInterceptors(interceptors: readonly HttpInterceptor[]): Provider[] {
  return [
    {
      provide: Http,
      useFactory: () => {
        const http = new Http();
        const parent = http.injector.parent ? inject(Http, { skipSelf: true }) : null;
        http.layers = [...(parent?.layers ?? []), ...interceptors.map((fn) => ({ fn, injector: http.injector }))];
        return http;
      },
    },
  ];
}

// --- declarative mocks -------------------------------------------------------

/** What a mock answers with, or how it fails. */
export interface HttpMockReply {
  /** Default 200. A non-2xx status errors the request with an `HttpError`, as the real client does. */
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Milliseconds before the answer; the request stays pending (and cancellable) meanwhile. */
  delay?: number;
  /** Fails the request with this kind of `HttpError` instead of answering. */
  error?: "network" | "abort";
}

/**
 * One mocked endpoint, plain data so a Scenario can carry it. `method` defaults to any. A string `url` matches the request
 * URL without its query string exactly, or as a prefix when it ends in `*`; a RegExp is tested against the URL with params.
 * `reply` is the answer, or a function of the request for answers that depend on it (a body, a param).
 */
export interface HttpMock {
  method?: string;
  url: string | RegExp;
  reply: HttpMockReply | ((req: HttpRequest) => HttpMockReply);
}

/** One request the mock backend saw: what asked, and which mock (index in the list) answered, `-1` when none did. */
export interface HttpMockEntry {
  method: string;
  url: string;
  mock: number;
  /** What it was answered with: `status` or the error kind. */
  outcome: string;
}

export interface HttpMockOptions {
  /** Called for every request, as it is received. */
  onRequest?(entry: HttpMockEntry): void;
  /** What a request no mock matches gets. Default: a 404 (and a console warning), so an unmocked call is visible instead of hanging. */
  unmatched?: HttpMockReply;
}

function mockMatches(mock: HttpMock, req: HttpRequest): boolean {
  if (mock.method !== undefined && mock.method.toUpperCase() !== req.method.toUpperCase()) return false;
  const full = buildUrl(req.url, req.params);
  if (mock.url instanceof RegExp) {
    mock.url.lastIndex = 0;
    return mock.url.test(full);
  }
  const path = req.url.split("?")[0]!;
  return mock.url.endsWith("*") ? path.startsWith(mock.url.slice(0, -1)) : path === mock.url;
}

/** An `HttpBackend` that answers from a list of mocks, first match wins. It is what `mockHttp` provides. */
export class HttpMockBackend extends HttpBackend {
  constructor(
    readonly mocks: readonly HttpMock[],
    readonly options: HttpMockOptions = {},
  ) {
    super();
  }
  override handle(req: HttpRequest): Observable<HttpResponse> {
    return new Observable((subscriber) => {
      const index = this.mocks.findIndex((m) => mockMatches(m, req));
      const mock = this.mocks[index];
      if (!mock && !this.options.unmatched) console.warn(`[gable] No HTTP mock for ${req.method} ${req.url}`);
      const reply = mock ? (typeof mock.reply === "function" ? mock.reply(req) : mock.reply) : (this.options.unmatched ?? { status: 404, statusText: "No mock" });
      const url = buildUrl(req.url, req.params);
      this.options.onRequest?.({ method: req.method, url, mock: index, outcome: reply.error ?? String(reply.status ?? 200) });
      const finish = () => {
        if (reply.error) return subscriber.error(new HttpError(reply.error, { url }));
        subscriber.next({ status: reply.status ?? 200, statusText: reply.statusText ?? "", url, headers: reply.headers ?? {}, body: reply.body ?? null });
        subscriber.complete();
      };
      if (!reply.delay) {
        finish();
        return;
      }
      const timer = setTimeout(finish, reply.delay);
      return () => clearTimeout(timer);
    });
  }
}

/** Providers that replace the HTTP backend with `mocks`. The Designer, `@gable/testing`'s `mountScene` and tests share it. */
export function mockHttp(mocks: readonly HttpMock[], options?: HttpMockOptions): Provider[] {
  return [{ provide: HttpBackend, useValue: new HttpMockBackend(mocks, options) }];
}
