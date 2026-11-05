export { analyzeProject } from "./analyze.js";
export type { AnalysisResult, Diagnostic } from "./analyze.js";
export { RULES } from "./config.js";
export type { AnalyzerConfig, RuleId, Severity } from "./config.js";
export { main as runCheck } from "./cli.js";
