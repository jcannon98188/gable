import ts from "@typescript/typescript6";

export type Severity = "off" | "warn" | "error";

/** The rule catalogue. Correctness rules default to error; advisory rules (later tickets) to warn. */
export const RULES = {
  "template-syntax": "error",
  "expression-syntax": "error",
  "unknown-member": "error",
  "type-mismatch": "error",
  "bare-signal": "error",
  "call-non-signal": "error",
  "call-observable": "error",
  "model-not-writable": "error",
  "model-type-mismatch": "error",
  "unknown-event": "error",
  "lazy-outside-defer": "error",
  "constructor-in-class": "error",
  "module-level-state": "warn",
  "class-fragment": "warn",
  "class-fields-config": "error",
  "router-link-import": "error",
  "router-link-type": "error",
  "field-not-a-field": "error",
  "field-value-mismatch": "error",
  "model-key-state": "error",
  "rows-track-key": "warn",
  "custom-control-members": "error",
  "component-meta": "error",
} as const satisfies Record<string, Severity>;

export type RuleId = keyof typeof RULES;

export interface AnalyzerConfig {
  /** Tag of tagged template literals that hold Gable templates. */
  templateTag: string;
  severity: Record<RuleId, Severity>;
}

export const PLUGIN_NAME = "@gable/language-service";

/** Reads the plugin entry of a tsconfig's `compilerOptions.plugins`. Problems come back as `errors`. */
export function readConfig(options: ts.CompilerOptions): { config: AnalyzerConfig; errors: string[] } {
  const errors: string[] = [];
  const entry = ((options.plugins as ts.PluginImport[] | undefined) ?? []).find((p) => p.name === PLUGIN_NAME) as Record<string, unknown> | undefined;
  const config: AnalyzerConfig = { templateTag: "html", severity: { ...RULES } };
  if (!entry) return { config, errors };
  if (entry.templateTag !== undefined) {
    if (typeof entry.templateTag === "string" && /^[A-Za-z_$][\w$]*$/.test(entry.templateTag)) config.templateTag = entry.templateTag;
    else errors.push(`plugin option "templateTag" must be an identifier, got ${JSON.stringify(entry.templateTag)}`);
  }
  const rules = entry.rules;
  if (rules !== undefined) {
    if (typeof rules !== "object" || rules === null || Array.isArray(rules)) errors.push(`plugin option "rules" must be an object`);
    else {
      for (const [name, value] of Object.entries(rules)) {
        if (!(name in RULES)) errors.push(`unknown rule "${name}" in plugin option "rules" (known rules: ${Object.keys(RULES).join(", ")})`);
        else if (value !== "off" && value !== "warn" && value !== "error") {
          errors.push(`rule "${name}" has severity ${JSON.stringify(value)}; use "off", "warn" or "error"`);
        } else config.severity[name as RuleId] = value;
      }
    }
  }
  return { config, errors };
}
