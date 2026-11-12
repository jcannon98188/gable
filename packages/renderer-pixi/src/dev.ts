/** Dev-only checks are gated on this so bundlers can drop them (`define: { __GABLE_DEV__: false }`). Same switch as @gable/core. */
declare const __GABLE_DEV__: boolean | undefined;
export const DEV = typeof __GABLE_DEV__ === "undefined" || __GABLE_DEV__ !== false;
