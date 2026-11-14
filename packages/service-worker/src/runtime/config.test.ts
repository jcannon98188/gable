// gable.sw.json validation, through the runtime's public entry.
import { describe, expect, it } from "vitest";
import { defineWorker, ServiceWorkerConfigError, validateConfig, type ServiceWorkerConfig } from "./index.js";

const full: ServiceWorkerConfig = {
  assetGroups: [
    { name: "app", installMode: "prefetch", files: ["/index.html", "/assets/**/*.js", "/assets/**/*.css"] },
    { name: "images", installMode: "lazy", files: ["/images/**"] },
  ],
  dataGroups: [
    { name: "api", urls: ["/api/**"], strategy: "freshness", timeoutMs: 3000 },
    { name: "avatars", urls: ["https://cdn.example/avatars/*"], strategy: "performance" },
  ],
  navigationFallback: { url: "/index.html", exclude: ["/api/**", "/**/*.*"] },
};

/** The issues validateConfig reports for `value`, as "path: message" lines. */
function issues(value: unknown): string[] {
  try {
    validateConfig(value);
  } catch (error) {
    if (!(error instanceof ServiceWorkerConfigError)) throw error;
    return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
  }
  return [];
}

describe("validateConfig", () => {
  it("accepts a config using every feature, and an empty one", () => {
    expect(validateConfig(full)).toEqual(full);
    expect(validateConfig({})).toEqual({});
    expect(validateConfig({ $schema: "./node_modules/whatever.json" })).toEqual({ $schema: "./node_modules/whatever.json" });
  });

  it("installMode defaults to prefetch", () => {
    expect(validateConfig({ assetGroups: [{ name: "app", files: ["/index.html"] }] }).assetGroups?.[0]?.installMode).toBe("prefetch");
  });

  it("rejects what is not an object", () => {
    expect(issues(null)).toEqual(["(root): must be an object, got null"]);
    expect(issues([])).toEqual(["(root): must be an object, got an array"]);
    expect(issues("x")).toEqual(["(root): must be an object, got a string"]);
  });

  it("reports every problem at once, each with its JSON path", () => {
    expect(
      issues({
        assetGroups: [
          { name: "app", installMode: "eager", files: ["index.html"] },
          { name: "app", files: [] },
          { files: ["/x"], resources: {} },
        ],
        dataGroups: [
          { name: "api", urls: ["/api/**"] },
          { name: "slow", urls: ["/slow"], strategy: "performance", timeoutMs: 100 },
          { name: "bad name", urls: ["api"], strategy: "freshness", timeoutMs: -1 },
        ],
        navigationFallback: { url: "index.html", exclude: "/api/**" },
        index: "/index.html",
      }),
    ).toEqual([
      `assetGroups[0].installMode: must be "prefetch" or "lazy", got "eager"`,
      `assetGroups[0].files[0]: must be a path pattern starting with "/", got "index.html"`,
      `assetGroups[1].name: "app" is already the name of assetGroups[0]`,
      `assetGroups[1].files: must list at least one pattern`,
      `assetGroups[2].name: is required: a name of letters, digits, ".", "_" or "-"`,
      `assetGroups[2].resources: is not a known setting (known: name, installMode, files)`,
      `dataGroups[0].strategy: is required: "freshness" or "performance"`,
      `dataGroups[1].timeoutMs: applies only to the "freshness" strategy`,
      `dataGroups[2].name: must be a name of letters, digits, ".", "_" or "-", got "bad name"`,
      `dataGroups[2].urls[0]: must be a path pattern starting with "/" or an absolute http(s) URL pattern, got "api"`,
      `dataGroups[2].timeoutMs: must be a number of milliseconds, 0 or more, got -1`,
      `navigationFallback.url: must be a path starting with "/", got "index.html"`,
      `navigationFallback.exclude: must be an array of path patterns, got a string`,
      `index: is not a known setting (known: $schema, assetGroups, dataGroups, navigationFallback)`,
    ]);
  });

  it("throws one error whose message lists every issue and names the file", () => {
    expect(() => validateConfig({ assetGroups: {}, dataGroups: [1] })).toThrow(
      [
        "gable.sw.json is invalid:",
        "  - assetGroups: must be an array of asset groups, got an object",
        "  - dataGroups[0]: must be an object, got a number",
      ].join("\n"),
    );
  });

  it("navigation fallback patterns must be same-origin paths", () => {
    expect(issues({ navigationFallback: { url: "/index.html", exclude: ["https://x.example/**"] } })).toEqual([
      `navigationFallback.exclude[0]: must be a path pattern starting with "/", got "https://x.example/**"`,
    ]);
  });

  it("defineWorker takes a JSON import as it is typed, with its strings widened, and validates it", () => {
    // What TypeScript infers for `import config from "./gable.sw.json"`.
    const json = { assetGroups: [{ name: "app", installMode: "prefetch" as string, files: ["/index.html"] }] };
    expect(defineWorker({ config: json }).config.assetGroups?.[0]?.installMode).toBe("prefetch");
    expect(() => defineWorker({ config: { assetGroups: [{ name: "app", installMode: "eager" as string, files: ["/x"] }] } })).toThrow(
      ServiceWorkerConfigError,
    );
  });

  it("defineWorker validates its config before anything runs", () => {
    expect(() => defineWorker({ config: { dataGroups: [{ name: "api", urls: [], strategy: "freshness" }] } })).toThrow(
      ServiceWorkerConfigError,
    );
  });
});
