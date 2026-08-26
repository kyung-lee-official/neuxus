/**
 * App-level defaults for the logger settings row (`app_log_settings`).
 * DB may override; null means "use this default".
 */

export const LOG_DEFAULTS = {
  sinks: ["console"] as const,
  queueSize: 1000,
  drainTimeoutMs: 2000,
  pretty: false,
} as const;

export const LOG_SINK_VALUES = ["console", "postgres"] as const;
export type LogSinkValue = (typeof LOG_SINK_VALUES)[number];

export type LogSettingsRow = {
  sinks?: readonly string[] | null;
  queueSize?: number | null;
  drainTimeoutMs?: number | null;
  pretty?: boolean | null;
};

export type StoredLogSettings = {
  sinks: readonly string[] | null;
  queueSize: number | null;
  drainTimeoutMs: number | null;
  pretty: boolean | null;
};

export type ResolvedLogSettings = {
  sinks: readonly LogSinkValue[];
  queueSize: number;
  drainTimeoutMs: number;
  pretty: boolean;
};

function isSinkValue(value: string): value is LogSinkValue {
  return (LOG_SINK_VALUES as readonly string[]).includes(value);
}

function nonEmpty(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

function positiveInt(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function resolveSinks(
  value: readonly string[] | null | undefined,
): readonly LogSinkValue[] {
  if (!value) return [...LOG_DEFAULTS.sinks];
  const out: LogSinkValue[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const t = nonEmpty(raw);
    if (!t) continue;
    if (seen.has(t)) continue;
    if (!isSinkValue(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.length > 0 ? out : [...LOG_DEFAULTS.sinks];
}

export function storedLogSettings(
  row?: LogSettingsRow | null,
): StoredLogSettings {
  return {
    sinks: row?.sinks ?? null,
    queueSize: row?.queueSize ?? null,
    drainTimeoutMs: row?.drainTimeoutMs ?? null,
    pretty: row?.pretty ?? null,
  };
}

export function resolveLogSettings(
  row?: LogSettingsRow | null,
): ResolvedLogSettings {
  return {
    sinks: resolveSinks(row?.sinks),
    queueSize: positiveInt(row?.queueSize) ?? LOG_DEFAULTS.queueSize,
    drainTimeoutMs:
      positiveInt(row?.drainTimeoutMs) ?? LOG_DEFAULTS.drainTimeoutMs,
    pretty: typeof row?.pretty === "boolean" ? row.pretty : LOG_DEFAULTS.pretty,
  };
}
