/**
 * DB-backed logger settings. Mirrors the `app_synthesis_settings` /
 * `kb_chunk_settings` pattern: single row `id = "default"`, nullable
 * columns, code defaults in `LOG_DEFAULTS` apply when a column is null.
 */

import { getPrisma } from "../db.ts";
import {
  LOG_DEFAULTS,
  LOG_SINK_VALUES,
  type LogSettingsRow,
  type LogSinkValue,
  type ResolvedLogSettings,
  resolveLogSettings,
  storedLogSettings,
} from "./defaults.ts";

const SETTINGS_ID = "default";

export type AdminLogSettings = {
  /** Resolved sinks. Empty/null stored value falls back to `defaults.sinks`. */
  sinks: readonly LogSinkValue[];
  queueSize: number | null;
  drainTimeoutMs: number | null;
  pretty: boolean | null;
  defaults: {
    sinks: readonly LogSinkValue[];
    queueSize: number;
    drainTimeoutMs: number;
    pretty: boolean;
  };
  availableSinks: readonly LogSinkValue[];
};

function parseSinkArray(value: unknown): readonly string[] | null {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === "string") out.push(item);
    }
    return out.length > 0 ? out : null;
  }
  if (typeof value === "string") {
    const parts = value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : null;
  }
  return null;
}

function intColumn(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

function boolColumn(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

async function fetchLogRow(): Promise<LogSettingsRow | null> {
  const row = await getPrisma().appLogSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return null;
  return {
    sinks: parseSinkArray(row.sinks),
    queueSize: intColumn(row.queueSize),
    drainTimeoutMs: intColumn(row.drainTimeoutMs),
    pretty: boolColumn(row.pretty),
  };
}

export async function loadLogSettings(): Promise<ResolvedLogSettings> {
  return resolveLogSettings(await fetchLogRow());
}

export async function adminLogSettings(): Promise<AdminLogSettings> {
  const stored = storedLogSettings(await fetchLogRow());
  return {
    sinks:
      (stored.sinks as readonly LogSinkValue[] | null) ?? LOG_DEFAULTS.sinks,
    queueSize: stored.queueSize,
    drainTimeoutMs: stored.drainTimeoutMs,
    pretty: stored.pretty,
    defaults: {
      sinks: LOG_DEFAULTS.sinks,
      queueSize: LOG_DEFAULTS.queueSize,
      drainTimeoutMs: LOG_DEFAULTS.drainTimeoutMs,
      pretty: LOG_DEFAULTS.pretty,
    },
    availableSinks: LOG_SINK_VALUES,
  };
}

function normalizeSinks(input: unknown): readonly LogSinkValue[] {
  if (!Array.isArray(input)) return [];
  const out: LogSinkValue[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (!LOG_SINK_VALUES.includes(t as LogSinkValue)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t as LogSinkValue);
  }
  return out;
}

function normalizePositiveInt(input: unknown): number | null {
  return typeof input === "number" && Number.isInteger(input) && input > 0
    ? input
    : null;
}

function normalizeBool(input: unknown): boolean | null {
  return typeof input === "boolean" ? input : null;
}

/** Upsert `app_log_settings` id `default`. Invalid values are stored as null. */
export async function saveLogSettings(
  row: LogSettingsRow,
): Promise<ResolvedLogSettings> {
  const sinks = normalizeSinks(row.sinks);
  const queueSize = normalizePositiveInt(row.queueSize);
  const drainTimeoutMs = normalizePositiveInt(row.drainTimeoutMs);
  const pretty = normalizeBool(row.pretty);

  const sinksValue = sinks.length > 0 ? (sinks as LogSinkValue[]) : null;

  await getPrisma().appLogSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      sinks: sinksValue ?? [],
      queueSize,
      drainTimeoutMs,
      pretty,
    },
    update: {
      sinks: sinksValue ?? [],
      queueSize,
      drainTimeoutMs,
      pretty,
    },
  });

  return loadLogSettings();
}

/** Write `LOG_DEFAULTS` into the row. */
export async function resetLogSettings(): Promise<AdminLogSettings> {
  await saveLogSettings({
    sinks: LOG_DEFAULTS.sinks,
    queueSize: LOG_DEFAULTS.queueSize,
    drainTimeoutMs: LOG_DEFAULTS.drainTimeoutMs,
    pretty: LOG_DEFAULTS.pretty,
  });
  return adminLogSettings();
}

/** Delete every row in `app_log`. Returns the count of rows removed. */
export async function purgeLogs(): Promise<{ deleted: number }> {
  const { count } = await getPrisma().appLog.deleteMany({});
  return { deleted: count };
}
