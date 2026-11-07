let counter = 0;
/** A DOM-safe unique id for a machine instance. */
export const uniqueId = (prefix: string): string => `${prefix}-${++counter}`;
