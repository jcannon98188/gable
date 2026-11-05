// `@gable/core/router`: route config, the outlet, router state as signals with Observable twins,
// function guards and the routerLink directives. Imports RxJS (a peer dependency).
export { Router, ActiveRoute, provideRouter } from "./router-state.js";
export type { NavigationEvent, NavigationOutcome, NavigateOptions } from "./router-state.js";
export { redirect } from "./router-config.js";
export type { Route, Redirect, RouteSnapshot, GuardResult, GuardReturn, CanActivateFn, CanDeactivateFn, CanMatchFn } from "./router-config.js";
export { RouterOutlet, RouterLink, RouterLinkActive } from "./router-view.js";
