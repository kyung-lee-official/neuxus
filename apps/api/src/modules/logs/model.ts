import { type Static, t } from "elysia";

const NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

export const LogsModel = {
  listQuery: t.Object({
    /** Comma-separated list of child-logger names. Defaults to `synthesis,retrieve`. */
    names: t.Optional(t.String()),
    /** Cursor returned by the previous page. Opaque; pass back unchanged. */
    cursor: t.Optional(t.String()),
    /** Page size, clamped to [1, 200]. Defaults to 50. */
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
  }),
  logItem: t.Object({
    id: t.String(),
    level: t.String(),
    msg: t.String(),
    name: t.Union([t.String(), t.Null()]),
    userId: t.Union([t.String(), t.Null()]),
    meta: t.Any(),
    createdAt: t.String(),
  }),
  listResponse: t.Object({
    items: t.Array(t.Ref("logItem")),
    nextCursor: t.Union([t.String(), t.Null()]),
  }),
} as const;

export type LogsModel = {
  [K in keyof typeof LogsModel]: Static<(typeof LogsModel)[K]>;
};

/** Allowed child-logger names that the `My logs` page exposes. */
export const LOG_PAGE_ALLOWED_NAMES = ["synthesis", "retrieve"] as const;

/** Parse the `?names=` query value into a deduped, allowed set. */
export function resolveLogNames(raw: string | undefined): string[] {
  const fallback = [...LOG_PAGE_ALLOWED_NAMES];
  if (!raw) return fallback;
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0 && NAME_PATTERN.test(p));
  const allowed = new Set<string>(LOG_PAGE_ALLOWED_NAMES);
  const filtered = parts.filter((p) => allowed.has(p));
  return filtered.length > 0 ? [...new Set(filtered)] : fallback;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function clampLogLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(raw), MAX_LIMIT);
}
