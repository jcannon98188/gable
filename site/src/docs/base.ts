/** The deploy base without a trailing slash: "" locally, "/gable" on GitHub Pages (SITE_BASE=/gable/). */
export const BASE: string = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");

/** The repository on GitHub, for source links. */
export const REPO = "https://github.com/jcannon98188/gable";

/** The browser URL for an app URL such as `/docs/router`. */
export const withBase = (appUrl: string): string => BASE + (appUrl.startsWith("/") ? appUrl : "/" + appUrl);

/** The path of an app URL, without query or hash. */
export const pathOf = (url: string): string => (url.split(/[?#]/)[0] || "/").replace(/(.)\/+$/, "$1");
