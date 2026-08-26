/**
 * Public app-logger API.
 *
 * - `getRootLogger()` returns a process-wide root logger. It is safe to
 *   call before `startLogWorker()`: records are enqueued but not yet
 *   drained.
 * - `childLogger(bindings, name?)` returns a child logger that merges
 *   `bindings` into every record's meta and (optionally) stamps the
 *   `name` column for cheap filtering in the DB.
 *
 * The same `PostgresTransport` instance backs every logger in the
 * process — there is one bounded queue, one worker, one `app_log` sink.
 */

import type { LogLevel } from "logixlysia";
import { type LogRecord, PostgresTransport } from "./sinks/postgres.ts";

export type AppLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>, name?: string) => AppLogger;
};

let transport: PostgresTransport | null = null;

/** Install the process-wide transport. Must be called before `startLogWorker()`. */
export function setLogTransport(t: PostgresTransport): void {
  transport = t;
}

export function getLogTransport(): PostgresTransport {
  if (!transport) transport = new PostgresTransport();
  return transport;
}

function normalizeLevel(level: LogLevel): string {
  switch (level) {
    case "DEBUG":
      return "debug";
    case "INFO":
      return "info";
    case "WARNING":
      return "warn";
    case "ERROR":
      return "error";
  }
}

function emit(
  level: LogLevel,
  message: string,
  name: string | null,
  meta: Record<string, unknown>,
): void {
  const record: LogRecord = {
    level: normalizeLevel(level),
    msg: message,
    name,
    meta,
    time: new Date().toISOString(),
  };
  try {
    getLogTransport().enqueueDirect(record);
  } catch {
    // transport.enqueueDirect is non-throwing; defensive catch only.
  }
}

function makeLogger(
  bindings: Record<string, unknown>,
  name: string | null,
): AppLogger {
  return {
    debug: (message, meta) =>
      emit("DEBUG", message, name, { ...bindings, ...meta }),
    info: (message, meta) =>
      emit("INFO", message, name, { ...bindings, ...meta }),
    warn: (message, meta) =>
      emit("WARNING", message, name, { ...bindings, ...meta }),
    error: (message, meta) =>
      emit("ERROR", message, name, { ...bindings, ...meta }),
    child: (childBindings, childName) =>
      makeLogger({ ...bindings, ...childBindings }, childName ?? name),
  };
}

export function getRootLogger(): AppLogger {
  return makeLogger({}, null);
}

export function childLogger(
  bindings: Record<string, unknown>,
  name?: string,
): AppLogger {
  return makeLogger(bindings, name ?? null);
}
