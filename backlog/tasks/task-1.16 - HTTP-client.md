---
id: TASK-1.16
title: HTTP client
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 06:13'
updated_date: '2026-11-05 06:58'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.13
parent_task_id: TASK-1
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Does gable ship an HTTP client in v0, and if so what is its shape: a thin fetch wrapper returning Observables or Promises, interceptors as DI-provided functions, error mapping into the app error handler, and a test-renderer-friendly way to fake it? Or is HTTP deliberately left to userland?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:38
---
Decision. (1) Ship a small optional entry point (@gable/http, like Forms); no HTTP in core. (2) Requests return cold Observables: send on subscribe, abort on unsubscribe; Promise users use firstValueFrom. Docs warn that a cold request bound directly in a template sends once per binding, so it usually belongs behind toSignal in the view model. (3) One injectable Http class: request(req) plus get/post/put/patch/delete; options { params, headers, body, responseType: json|text|blob|arraybuffer, observe: 'body'|'response', signal? }; default result is the parsed body typed by a generic, no runtime validation. (4) Interceptors are plain functions (req, next) => Observable<Response> run in the injection context, supplied via a multi-provider token or withInterceptors([...]); requests are immutable; they layer by injector depth (root, route, component), outer to inner, so a Route can add an auth interceptor. (5) Non-2xx and network failures error the Observable with a typed HttpError { kind: status|network|abort|parse, status, statusText, url, body, headers }; handled with catchError, otherwise flows to ErrorHandler via the existing subscription/binding paths; unsubscribe aborts never error; no extra reporting hook. (6) An HttpBackend Token (default: fetch) sits under the interceptors; the test harness ships a recording fake (expectOne/respond/verify) so unexpected requests fail tests via the rethrowing ErrorHandler; exact harness API belongs to the Testing story ticket. (7) HMR: no special handling; in-flight requests abort with their scope and re-run on the new instance as setup re-runs; data already in signals is kept by state transfer; no caching or dedup. (8) Out of v0: response caching and dedup, retry/backoff (use RxJS retry), progress and upload streaming, XSRF/cookie helpers, JSONP, typed endpoints and schema validation, GraphQL/WebSocket/SSE clients, base-URL config beyond an interceptor. Glossary terms added: Interceptor, HTTP backend.
---

created: 2026-11-05 06:58
---
From Public package layout and versioning: the HTTP client ships as the @gable/core/http entry point, not a separate @gable/http package.
---
<!-- COMMENTS:END -->
