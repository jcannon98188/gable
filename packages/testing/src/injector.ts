import { createInjector, type Injector, type Provider } from "@gable/core";
import { HttpBackend } from "@gable/core/http";
import { HttpTestingBackend } from "./http.js";

/**
 * An injector with `run(fn)` and no renderer, for services, guards and
 * interceptors. Providers passed here override any Token. HttpBackend is the
 * recording fake; reach it with `httpTesting(injector)`. Destroying the injector
 * fails if a request is still unmatched.
 */
export function createTestInjector(providers: Provider[] = []): Injector {
  const injector = createInjector([{ provide: HttpBackend, useValue: new HttpTestingBackend() }, ...providers]);
  const destroy = injector.destroy.bind(injector);
  injector.destroy = () => {
    try {
      const backend = injector.get(HttpBackend, { optional: true });
      if (backend instanceof HttpTestingBackend) backend.verify();
    } finally {
      destroy();
    }
  };
  return injector;
}

/** The recording fake behind `Http` in this injector, and throws if a test replaced HttpBackend. */
export function httpTesting(injector: Injector): HttpTestingBackend {
  const backend = injector.get(HttpBackend);
  if (!(backend instanceof HttpTestingBackend)) throw new Error("HttpBackend was replaced; there is no recording fake in this injector.");
  return backend;
}
