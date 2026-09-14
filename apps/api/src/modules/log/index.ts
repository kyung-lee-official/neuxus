/**
 * Public app-logger API.
 *
 * The logger is generic and business-agnostic; call sites import from here:
 *
 * ```ts
 * import { getRootLogger, childLogger, startLogWorker } from "modules/log";
 * ```
 */

export {
  LOG_DEFAULTS,
  LOG_SINK_VALUES,
  type LogSettingsRow,
  type LogSinkValue,
  type ResolvedLogSettings,
  resolveLogSettings,
  type StoredLogSettings,
  storedLogSettings,
} from "./defaults.ts";
export type { AppLogger } from "./logger.ts";
export {
  childLogger,
  getLogTransport,
  getRootLogger,
  setLogTransport,
} from "./logger.ts";
export { BoundedQueue } from "./queue.ts";
export { type AdminLogSettings, LogSettings } from "./service.ts";
export {
  flushLogs,
  installShutdownHandlers,
  logStats,
  startLogWorker,
} from "./shutdown.ts";
export { PostgresTransport } from "./sinks/postgres.ts";
