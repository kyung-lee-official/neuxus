/**
 * App-log DAL. Owns the `app_log` table: the sink's inserts and the admin
 * purge.
 *
 * Internal to the log module: `sinks/postgres-transport.ts` imports it.
 * `deleteAllLogs` is re-exported from the module barrel for the admin purge
 * route.
 */

import { hostname } from "node:os";
import { getPrisma } from "../../shared/db.ts";

export type LogRecord = {
  level: string;
  msg: string;
  name: string | null;
  /** Optional owner. Set by the retrieve and synthesis domains only. */
  userId: string | null;
  meta: Record<string, unknown>;
  /** Stamped at enqueue time (sync path). */
  time: string;
};

/** Insert one `app_log` row; returns false on a failed write (best-effort). */
export async function insertLog(record: LogRecord): Promise<boolean> {
  const meta = {
    ...record.meta,
    time: record.time,
    pid: process.pid,
    hostname: hostname(),
  };
  try {
    await getPrisma().appLog.create({
      data: {
        level: record.level,
        msg: record.msg,
        name: record.name,
        userId: record.userId,
        meta,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Delete every `app_log` row; returns the count removed. */
export async function deleteAllLogs(): Promise<number> {
  const { count } = await getPrisma().appLog.deleteMany({});
  return count;
}
