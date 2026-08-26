/**
 * Public app-logger API.
 *
 * The logger is generic, business-agnostic, and not wired into the
 * existing modules. Call sites for the next rollout import from here:
 *
 * ```ts
 * import { getRootLogger, childLogger, startLogWorker } from "@shared/log";
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
export {
  adminLogSettings,
  loadLogSettings,
  purgeLogs,
  resetLogSettings,
  saveLogSettings,
} from "./settings.ts";
export {
  flushLogs,
  installShutdownHandlers,
  logStats,
  startLogWorker,
} from "./shutdown.ts";
export { PostgresTransport } from "./sinks/postgres.ts";
