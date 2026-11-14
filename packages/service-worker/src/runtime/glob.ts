// The path globs gable.sw.json uses: `*` within one segment, `**` across any number of whole segments.
// They are not core's fetch route patterns (`FetchRoutePattern`), where `*` crosses slashes and `:name` captures a
// segment: `/assets/*` matches `/assets/img/logo.png` as a route pattern but not as a glob, which needs `/assets/**`.

const escape = (text: string) => text.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Compiles a glob to an anchored RegExp over a path, or over `origin + path` for an absolute glob. `*` matches within
 * one path segment and `**` across segments, unlike `*` in core's fetch route patterns, which also crosses slashes.
 */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (const [token] of glob.matchAll(/\/\*\*(?=\/|$)|\*\*|\*|\/|[^*/]+/g)) {
    if (token === "/**") source += "(?:/.*)?";
    else if (token === "**") source += ".*";
    else if (token === "*") source += "[^/]*";
    else source += escape(token);
  }
  return new RegExp(`^${source}$`);
}

/**
 * A predicate for URLs matching any of `globs`: same-origin ones (`/...`) match `url`'s path on `origin`, absolute
 * ones match its origin and path. The query string is ignored.
 */
export function urlMatcher(globs: readonly string[], origin: string): (url: URL) => boolean {
  const local = globs.filter((glob) => glob.startsWith("/")).map(globToRegExp);
  const absolute = globs.filter((glob) => !glob.startsWith("/")).map(globToRegExp);
  return (url) =>
    (url.origin === origin && local.some((regexp) => regexp.test(url.pathname))) ||
    absolute.some((regexp) => regexp.test(url.origin + url.pathname));
}
