// Tooling entry: the template expression grammar, shared with @gable/language-service
// so the editor, `gable-check` and the runtime agree on what an expression is.
export { parseExpression, parseHandler } from "./expression.js";
export type { Expr, HandlerExpr } from "./expression.js";
// Template scanning primitives, shared so the editor tooling splits templates exactly as the runtime does.
export { VOID, BLOCK_START, indexOfTopLevel } from "./template.js";
// i18n message core and template extraction, shared with the Vite plugin (DOM-free).
export * from "./i18n-message.js";
export { extractTemplateMessages } from "./i18n-extract.js";
