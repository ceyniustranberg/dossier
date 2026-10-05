import "server-only";

interface Window { count: number; startedAt: number }

const store = new Map<string, Window>();

export interface Limit { max: number; windowMs: number }

// Rough per-user caps. These are per serverless instance, so on Vercel the effective
// global cap can be a small multiple. Enough to stop a runaway loop from burning the
// OpenRouter credits; loose enough that a real user does not feel throttled.
export const LIMITS = {
  dig: { max: 15, windowMs: 60_000 },
  images: { max: 15, windowMs: 60_000 },
  // MCP tool calls from the user's own agent; a dossier is a handful of these.
  mcp: { max: 120, windowMs: 60_000 },
  // Card drags and drop spots saved from the board.
  board: { max: 240, windowMs: 60_000 },
  // Issuing or revoking the personal MCP token.
  token: { max: 10, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

export type Bucket = keyof typeof LIMITS;

/** 0 when the request is allowed. Otherwise the seconds remaining in the current window. */
export function check(key: string, limit: Limit, now = Date.now()): number {
  const w = store.get(key);
  if (!w || now - w.startedAt >= limit.windowMs) {
    store.set(key, { count: 1, startedAt: now });
    return 0;
  }
  if (w.count >= limit.max) return Math.max(1, Math.ceil((limit.windowMs - (now - w.startedAt)) / 1000));
  w.count++;
  return 0;
}

/** Test hook; not used at runtime. */
export function _reset() { store.clear(); }
