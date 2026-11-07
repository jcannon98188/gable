import { Observable } from "rxjs";
import { HttpBackend, HttpError, type HttpRequest, type HttpResponse } from "@gable/core/http";

/** One request the fake received. Answer it with `respond`, `networkError` or `abortError`. */
export class TestRequest {
  cancelled = false;
  answered = false;
  constructor(
    readonly request: HttpRequest,
    private readonly subscriber: { next(r: HttpResponse): void; error(e: unknown): void; complete(): void },
  ) {}

  /** Answers with a response; a non-2xx `status` errors the request with an HttpError, as the real client does. */
  respond(body: unknown = null, init: { status?: number; statusText?: string; headers?: Record<string, string> } = {}): void {
    this.#settle(() => {
      this.subscriber.next({
        body,
        status: init.status ?? 200,
        statusText: init.statusText ?? "",
        url: this.request.url,
        headers: init.headers ?? {},
      });
      this.subscriber.complete();
    });
  }

  networkError(): void {
    this.#settle(() => this.subscriber.error(new HttpError("network", { url: this.request.url })));
  }

  abortError(): void {
    this.#settle(() => this.subscriber.error(new HttpError("abort", { url: this.request.url })));
  }

  #settle(fn: () => void): void {
    if (this.cancelled) throw new Error(`Request ${describe(this.request)} was cancelled (unsubscribed); it cannot be answered.`);
    if (this.answered) throw new Error(`Request ${describe(this.request)} was already answered.`);
    this.answered = true;
    fn();
  }
}

/**
 * Selects open requests in `fixture.http`: a URL string (exact match), an object with `method` and/or `url`, or a
 * predicate over the request. Query strings are part of `url`, so match them too.
 */
export type RequestMatch = string | { method?: string; url?: string } | ((request: HttpRequest) => boolean);

function describe(r: HttpRequest): string {
  return `${r.method} ${r.url}`;
}

function matcher(match: RequestMatch): (r: HttpRequest) => boolean {
  if (typeof match === "function") return match;
  if (typeof match === "string") return (r) => r.url === match;
  return (r) => (match.method === undefined || r.method === match.method) && (match.url === undefined || r.url === match.url);
}

/**
 * The recording HttpBackend installed by the harness. Requests are recorded on
 * subscribe and wait for the test to answer them. Requests that are neither
 * answered, matched, nor cancelled fail `verify()` and the fixture teardown.
 */
export class HttpTestingBackend extends HttpBackend {
  #open: TestRequest[] = [];

  override handle(request: HttpRequest): Observable<HttpResponse> {
    return new Observable((subscriber) => {
      const entry = new TestRequest(request, subscriber);
      this.#open.push(entry);
      return () => {
        entry.cancelled = !entry.answered;
        this.#open = this.#open.filter((e) => e !== entry);
      };
    });
  }

  /** Removes and returns every open request matching `match`. */
  match(match: RequestMatch): TestRequest[] {
    const test = matcher(match);
    const found = this.#open.filter((e) => test(e.request));
    this.#open = this.#open.filter((e) => !found.includes(e));
    return found;
  }

  /** Expects exactly one open request matching; removes and returns it. */
  expectOne(match: RequestMatch): TestRequest {
    const test = matcher(match);
    const found = this.#open.filter((e) => test(e.request));
    if (found.length !== 1) {
      throw new Error(
        `Expected one matching request, found ${found.length}. Open requests: ${this.#open.map((e) => describe(e.request)).join(", ") || "none"}.`,
      );
    }
    this.#open = this.#open.filter((e) => e !== found[0]);
    return found[0]!;
  }

  /** Expects no open request matching. */
  expectNone(match: RequestMatch): void {
    const found = this.#open.filter((e) => matcher(match)(e.request));
    if (found.length > 0) throw new Error(`Expected no matching request, found ${found.length}: ${found.map((e) => describe(e.request)).join(", ")}.`);
  }

  /** Throws if any request is still open (sent, not matched, not cancelled). */
  verify(): void {
    if (this.#open.length > 0) {
      throw new Error(`Unmatched HTTP requests at teardown: ${this.#open.map((e) => describe(e.request)).join(", ")}.`);
    }
  }
}
