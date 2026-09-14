/**
 * App logger.
 *
 * - `Logger.root()` returns the process-wide root logger. It is safe to
 *   call before `startLogWorker()`: records are enqueued but not yet drained.
 * - `Logger.child(bindings, name?)` returns a child logger that merges
 *   `bindings` into every record's meta and (optionally) stamps the `name`
 *   column for cheap filtering in the DB.
 *
 * The same `PostgresTransport` instance backs every logger in the process —
 * there is one bounded queue, one worker, one `app_log` sink.
 */

import type { LogLevel } from "logixlysia";
import { type LogRecord, PostgresTransport } from "./sinks/postgres.ts";

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

export class Logger {
  private static transport: PostgresTransport | null = null;

  /** Install the process-wide transport. Must be called before `startLogWorker()`. */
  static setTransport(transport: PostgresTransport): void {
    Logger.transport = transport;
  }

  static getTransport(): PostgresTransport {
    if (!Logger.transport) Logger.transport = new PostgresTransport();
    return Logger.transport;
  }

  /** Root logger (no bindings, no name). */
  static root(): Logger {
    return new Logger({}, null);
  }

  /** Child logger that merges `bindings` and (optionally) stamps `name`. */
  static child(bindings: Record<string, unknown>, name?: string): Logger {
    return new Logger(bindings, name ?? null);
  }

  private constructor(
    private readonly bindings: Record<string, unknown>,
    private readonly name: string | null,
  ) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit("DEBUG", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.emit("INFO", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.emit("WARNING", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.emit("ERROR", message, meta);
  }

  child(bindings: Record<string, unknown>, name?: string): Logger {
    return new Logger({ ...this.bindings, ...bindings }, name ?? this.name);
  }

  private emit(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    // Hoist `userId` out of `meta` so it lands in the dedicated `user_id`
    // column instead of being buried in the JSON blob. Set by the retrieve
    // and synthesis domains; all other loggers leave it null.
    const { userId: rawUserId, ...rest } = { ...this.bindings, ...meta };
    const userId =
      typeof rawUserId === "string" && rawUserId.trim() !== ""
        ? rawUserId
        : null;
    const record: LogRecord = {
      level: normalizeLevel(level),
      msg: message,
      name: this.name,
      userId,
      meta: rest,
      time: new Date().toISOString(),
    };
    try {
      Logger.getTransport().enqueueDirect(record);
    } catch {
      // transport.enqueueDirect is non-throwing; defensive catch only.
    }
  }
}
