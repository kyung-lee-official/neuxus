/**
 * Log DAL. Owns the `app_log_settings` singleton row (id `default`) and the
 * `app_log` purge.
 *
 * Internal: only `service.ts` imports this file.
 */

import { getPrisma } from "../../shared/db.ts";

const SETTINGS_ID = "default";

/** Raw `app_log_settings` row (id `default`), columns verbatim. */
export type LogSettingsRecord = {
  sinks: string[];
  queueSize: number | null;
  drainTimeoutMs: number | null;
  pretty: boolean | null;
};

/** Load `app_log_settings` id `default`, or null when no row exists. */
export async function findLogSettingsRecord(): Promise<LogSettingsRecord | null> {
  const row = await getPrisma().appLogSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return null;
  return {
    sinks: row.sinks,
    queueSize: row.queueSize,
    drainTimeoutMs: row.drainTimeoutMs,
    pretty: row.pretty,
  };
}

/** Upsert `app_log_settings` id `default`. */
export async function upsertLogSettings(fields: {
  sinks: string[];
  queueSize: number | null;
  drainTimeoutMs: number | null;
  pretty: boolean | null;
}): Promise<void> {
  await getPrisma().appLogSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...fields },
    update: { ...fields },
  });
}

/** Delete every `app_log` row; returns the count removed. */
export async function deleteAllLogs(): Promise<number> {
  const { count } = await getPrisma().appLog.deleteMany({});
  return count;
}
