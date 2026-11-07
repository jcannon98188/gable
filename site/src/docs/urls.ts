import type { ApiSymbol } from "./api-types.js";

// App URLs (the router adds the deploy base). Symbols are addressed by their extractor id, URL-encoded.
export const guideUrl = (slug: string, id?: string): string => `/docs/guides/${slug}${id ? "#" + id : ""}`;
export const packageUrl = (slug: string): string => `/docs/${slug}`;
export const apiUrl = (slug: string): string => `/docs/${slug}/api`;
export const symbolUrl = (slug: string, symbol: Pick<ApiSymbol, "id">): string => `/docs/${slug}/api/${encodeURIComponent(symbol.id)}`;
