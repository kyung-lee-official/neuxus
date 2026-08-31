import { status } from "elysia";
import type { AppUser } from "../../shared/db.ts";
import { getPrisma } from "../../shared/db.ts";
import { clampLogLimit, type LogsModel, resolveLogNames } from "./model.ts";

export type LogListResult = {
  items: LogsModel["logItem"][];
  nextCursor: string | null;
};

type AppLogRow = {
  id: bigint;
  level: string;
  msg: string;
  name: string | null;
  userId: string | null;
  meta: unknown;
  createdAt: Date;
};

function rowToItem(row: AppLogRow): LogsModel["logItem"] {
  return {
    id: row.id.toString(),
    level: row.level,
    msg: row.msg,
    name: row.name,
    userId: row.userId,
    meta: row.meta,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Cursor is the `id` of the last row on the previous page. Rows are
 * ordered by `id DESC` (autoincrement BigInt — strictly increasing with
 * insert order, so this is effectively `createdAt DESC`).
 */
function parseCursor(raw: string | undefined): bigint | null {
  if (!raw) return null;
  try {
    const n = BigInt(raw);
    if (n <= 0n) return null;
    return n;
  } catch {
    throw status(400, { error: "Invalid cursor" });
  }
}

export abstract class Logs {
  static async listForUser(
    user: AppUser,
    query: LogsModel["listQuery"],
  ): Promise<LogListResult> {
    const names = resolveLogNames(query.names);
    const limit = clampLogLimit(query.limit);
    const cursor = parseCursor(query.cursor);

    const rows = await getPrisma().appLog.findMany({
      where: {
        userId: user.id,
        name: { in: names },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(rowToItem);
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow ? lastRow.id.toString() : null;

    return { items, nextCursor };
  }
}
