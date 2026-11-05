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
