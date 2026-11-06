import type { Route } from '@gable/core/router';

/** `#/`, `#/active` and `#/completed`. The filter rides along as route data. */
export const routes: Route[] = [
  { path: '', data: { filter: 'all' } },
  { path: 'active', data: { filter: 'active' } },
  { path: 'completed', data: { filter: 'completed' } },
  { path: '**', redirectTo: '/' },
];
