/**
 * Log-settings domain. Owns the `app_log_settings` singleton row (id
 * `default`) only. The logger engine itself (`logger.ts`, `queue.ts`,
 * `sinks/`) stays function/singleton based.
 */

import { findLogSettingsRecord, upsertLogSettings } from "./dal.ts";
import {
  LOG_DEFAULTS,
  LOG_SINK_VALUES,
  type LogSettingsRow,
  type LogSinkValue,
  type ResolvedLogSettings,
  resolveLogSettings,
  storedLogSettings,
} from "./defaults.ts";

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
  const record = await findLogSettingsRecord();
  if (!record) return null;
  return {
    sinks: parseSinkArray(record.sinks),
    queueSize: intColumn(record.queueSize),
    drainTimeoutMs: intColumn(record.drainTimeoutMs),
    pretty: boolColumn(record.pretty),
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

export abstract class LogSettings {
  /** Effective log settings (stored row, else code defaults). */
  static async load(): Promise<ResolvedLogSettings> {
    return resolveLogSettings(await fetchLogRow());
  }

  /** Stored row + code defaults + available sinks, for the admin form. */
  static async admin(): Promise<AdminLogSettings> {
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

  /** Upsert `app_log_settings` id `default`. Invalid values stored as null. */
  static async save(row: LogSettingsRow): Promise<ResolvedLogSettings> {
    const sinks = normalizeSinks(row.sinks);
    await upsertLogSettings({
      sinks: sinks.length > 0 ? [...sinks] : [],
      queueSize: normalizePositiveInt(row.queueSize),
      drainTimeoutMs: normalizePositiveInt(row.drainTimeoutMs),
      pretty: normalizeBool(row.pretty),
    });
    return LogSettings.load();
  }

  /** Write `LOG_DEFAULTS` into the row. */
  static async reset(): Promise<AdminLogSettings> {
    await LogSettings.save({
      sinks: LOG_DEFAULTS.sinks,
      queueSize: LOG_DEFAULTS.queueSize,
      drainTimeoutMs: LOG_DEFAULTS.drainTimeoutMs,
      pretty: LOG_DEFAULTS.pretty,
    });
    return LogSettings.admin();
  }
}
