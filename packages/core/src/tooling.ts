// Tooling entry: the template expression grammar, shared with @gable/language-service
// so the editor, `gable-check` and the runtime agree on what an expression is.
export { parseExpression, parseHandler } from "./expression.js";
export type { Expr, HandlerExpr } from "./expression.js";
