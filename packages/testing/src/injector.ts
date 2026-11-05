import { createInjector, type Injector, type Provider } from "@gable/core";

/**
 * An injector with `run(fn)` and no renderer, for services, guards and
 * interceptors. Providers passed here override any Token.
 */
export function createTestInjector(providers: Provider[] = []): Injector {
  return createInjector(providers);
}
