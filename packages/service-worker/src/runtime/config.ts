// gable.sw.json: the default worker's configuration, and its validation.

/**
 * The default worker's configuration, the contents of `gable.sw.json`. Every setting is optional: an empty config
 * gives a worker that caches nothing but still speaks the app protocol, so updates stay app-controlled.
 *
 * Patterns are globs over URL paths: `*` matches any run of characters within one path segment, `**` matches any
 * number of whole segments (`/assets/**` matches everything under `/assets/`, `/**\/*.js` every `.js` file). The query
 * string is not part of the path.
 */
export interface ServiceWorkerConfig {
  /** A JSON schema reference for editors. Ignored by the worker. */
  readonly $schema?: string;
  /** The app's own build output, cached by release. A file belongs to the first group whose patterns match it. */
  readonly assetGroups?: readonly AssetGroupConfig[];
  /** Data requests (APIs, other origins), cached at runtime with a strategy. The first group whose URLs match a request answers it. */
  readonly dataGroups?: readonly DataGroupConfig[];
  /** Answers page navigations with the app's shell, so client-side routes load offline. */
  readonly navigationFallback?: NavigationFallbackConfig;
}

/**
 * How an asset group's files are cached.
 *
 * - `"prefetch"`: every file is fetched while the release installs, so the app works offline from its first load.
 *   The release only becomes ready once all of them are stored.
 * - `"lazy"`: a file is cached the first time the app requests it, and served from the cache after that.
 *
 * Either way the cache belongs to the release: a new release starts with its own, so files of two releases never mix.
 */
export type AssetInstallMode = "prefetch" | "lazy";

/** A group of build output files, selected from the asset manifest by path patterns. */
export interface AssetGroupConfig {
  /** The group's name: letters, digits, `.`, `_` or `-`, unique among asset groups. */
  readonly name: string;
  /** When the group's files are fetched. Defaults to `"prefetch"`. */
  readonly installMode?: AssetInstallMode;
  /** Path patterns selecting files from the asset manifest, such as `"/index.html"` or `"/assets/**"`. */
  readonly files: readonly string[];
}

/**
 * How a data group answers.
 *
 * - `"freshness"`: network first. The cached copy answers only when the network fails, or takes longer than
 *   {@link DataGroupConfig.timeoutMs}.
 * - `"performance"`: cache first. A cached copy answers at once and is refreshed from the network in the background;
 *   only a miss waits for the network.
 */
export type DataStrategy = "freshness" | "performance";

/** A group of data URLs cached at runtime with one strategy, in a cache that outlives releases. */
export interface DataGroupConfig {
  /** The group's name: letters, digits, `.`, `_` or `-`, unique among data groups. It names the group's cache. */
  readonly name: string;
  /** URL patterns: same-origin paths such as `"/api/**"`, or absolute ones such as `"https://cdn.example/**"`. */
  readonly urls: readonly string[];
  /** How the group answers. */
  readonly strategy: DataStrategy;
  /** For `"freshness"` only: how long to wait for the network, in milliseconds, before answering from the cache. */
  readonly timeoutMs?: number;
}

/** Which navigations are answered with the app's shell. */
export interface NavigationFallbackConfig {
  /** The shell's path, such as `"/index.html"`. It must be a file of a prefetch asset group. */
  readonly url: string;
  /**
   * Path patterns of navigations to leave to the network, such as server-rendered pages. Defaults to
   * `["/**\/*.*"]`, every path whose last segment has a dot, which is how files look. Setting it replaces the
   * default; list `"/**\/*.*"` as well to keep it.
   */
  readonly exclude?: readonly string[];
}

/** One problem with a config. */
export interface ServiceWorkerConfigIssue {
  /** Where the problem is, as a JSON path such as `assetGroups[0].files[1]`, or `(root)` for the config itself. */
  readonly path: string;
  /** What is wrong. */
  readonly message: string;
}

/** Thrown when a config, or a config and its asset manifest, are invalid. Lists every problem found, not just the first. */
export class ServiceWorkerConfigError extends Error {
  /** Every problem found, in document order. */
  readonly issues: readonly ServiceWorkerConfigIssue[];

  constructor(issues: readonly ServiceWorkerConfigIssue[], subject = "gable.sw.json") {
    super([`${subject} is invalid:`, ...issues.map((issue) => `  - ${issue.path}: ${issue.message}`)].join("\n"));
    this.name = "ServiceWorkerConfigError";
    this.issues = issues;
  }
}

const NAME = /^[\w.-]+$/;
const NAME_RULE = `a name of letters, digits, ".", "_" or "-"`;
const ABSOLUTE = /^https?:\/\/[^/]+\//;

/** Describes `value`'s JSON type for an error message. */
function show(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

const kind = (value: unknown) =>
  value === null ? "null" : Array.isArray(value) ? "an array" : typeof value === "object" ? "an object" : `a ${typeof value}`;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

class Issues {
  readonly list: ServiceWorkerConfigIssue[] = [];
  add(path: string, message: string): void {
    this.list.push({ path: path || "(root)", message });
  }
}

function checkKeys(issues: Issues, path: string, value: Record<string, unknown>, known: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) issues.add(`${path}${path ? "." : ""}${key}`, `is not a known setting (known: ${known.join(", ")})`);
  }
}

function checkName(issues: Issues, path: string, name: unknown, seen: Map<string, string>): void {
  if (name === undefined) return issues.add(`${path}.name`, `is required: ${NAME_RULE}`);
  if (typeof name !== "string" || !NAME.test(name)) return issues.add(`${path}.name`, `must be ${NAME_RULE}, got ${show(name)}`);
  const first = seen.get(name);
  if (first !== undefined) return issues.add(`${path}.name`, `"${name}" is already the name of ${first}`);
  seen.set(name, path);
}

function checkPatterns(
  issues: Issues,
  path: string,
  value: unknown,
  options: { required: boolean; absolute: boolean },
): void {
  const rule = options.absolute
    ? `a path pattern starting with "/" or an absolute http(s) URL pattern`
    : `a path pattern starting with "/"`;
  if (value === undefined) {
    if (options.required) issues.add(path, "is required: an array of patterns");
    return;
  }
  if (!Array.isArray(value)) return issues.add(path, `must be an array of ${options.absolute ? "URL" : "path"} patterns, got ${kind(value)}`);
  if (options.required && value.length === 0) return issues.add(path, "must list at least one pattern");
  value.forEach((pattern: unknown, index) => {
    const ok = typeof pattern === "string" && (pattern.startsWith("/") || (options.absolute && ABSOLUTE.test(pattern)));
    if (!ok) issues.add(`${path}[${index}]`, `must be ${rule}, got ${show(pattern)}`);
  });
}

function checkGroups(issues: Issues, key: string, value: unknown, check: (path: string, group: Record<string, unknown>) => void): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) return issues.add(key, `must be an array of ${key === "assetGroups" ? "asset" : "data"} groups, got ${kind(value)}`);
  value.forEach((group: unknown, index) => {
    const path = `${key}[${index}]`;
    if (!isObject(group)) return issues.add(path, `must be an object, got ${kind(group)}`);
    check(path, group);
  });
}

/**
 * Checks that `value`, typically the parsed contents of `gable.sw.json`, is a valid {@link ServiceWorkerConfig}.
 * Unknown settings are errors, so a misspelt one is not silently ignored.
 * @returns the config, with asset groups' `installMode` defaulted to `"prefetch"`.
 * @throws ServiceWorkerConfigError listing every problem, each with its JSON path.
 */
export function validateConfig(value: unknown): ServiceWorkerConfig {
  const issues = new Issues();
  if (!isObject(value)) {
    issues.add("", `must be an object, got ${kind(value)}`);
    throw new ServiceWorkerConfigError(issues.list);
  }

  const assetNames = new Map<string, string>();
  checkGroups(issues, "assetGroups", value.assetGroups, (path, group) => {
    checkName(issues, path, group.name, assetNames);
    if (group.installMode !== undefined && group.installMode !== "prefetch" && group.installMode !== "lazy") {
      issues.add(`${path}.installMode`, `must be "prefetch" or "lazy", got ${show(group.installMode)}`);
    }
    checkPatterns(issues, `${path}.files`, group.files, { required: true, absolute: false });
    checkKeys(issues, path, group, ["name", "installMode", "files"]);
  });

  const dataNames = new Map<string, string>();
  checkGroups(issues, "dataGroups", value.dataGroups, (path, group) => {
    checkName(issues, path, group.name, dataNames);
    checkPatterns(issues, `${path}.urls`, group.urls, { required: true, absolute: true });
    const { strategy, timeoutMs } = group;
    if (strategy === undefined) issues.add(`${path}.strategy`, `is required: "freshness" or "performance"`);
    else if (strategy !== "freshness" && strategy !== "performance") {
      issues.add(`${path}.strategy`, `must be "freshness" or "performance", got ${show(strategy)}`);
    }
    if (timeoutMs !== undefined) {
      if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
        issues.add(`${path}.timeoutMs`, `must be a number of milliseconds, 0 or more, got ${show(timeoutMs)}`);
      } else if (strategy === "performance") {
        issues.add(`${path}.timeoutMs`, `applies only to the "freshness" strategy`);
      }
    }
    checkKeys(issues, path, group, ["name", "urls", "strategy", "timeoutMs"]);
  });

  const fallback = value.navigationFallback;
  if (fallback !== undefined) {
    if (!isObject(fallback)) issues.add("navigationFallback", `must be an object, got ${kind(fallback)}`);
    else {
      if (typeof fallback.url !== "string" || !fallback.url.startsWith("/")) {
        issues.add("navigationFallback.url", `must be a path starting with "/", got ${show(fallback.url)}`);
      }
      checkPatterns(issues, "navigationFallback.exclude", fallback.exclude, { required: false, absolute: false });
      checkKeys(issues, "navigationFallback", fallback, ["url", "exclude"]);
    }
  }

  if (value.$schema !== undefined && typeof value.$schema !== "string") {
    issues.add("$schema", `must be a string, got ${show(value.$schema)}`);
  }
  checkKeys(issues, "", value, ["$schema", "assetGroups", "dataGroups", "navigationFallback"]);

  if (issues.list.length) throw new ServiceWorkerConfigError(issues.list);
  const config = value as unknown as ServiceWorkerConfig;
  if (!config.assetGroups) return config;
  return { ...config, assetGroups: config.assetGroups.map((group) => ({ ...group, installMode: group.installMode ?? "prefetch" })) };
}
