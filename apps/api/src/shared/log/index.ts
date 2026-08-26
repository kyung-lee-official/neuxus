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

export type { AppLogger } from "./logger.ts";
export { childLogger, getLogTransport, getRootLogger } from "./logger.ts";
export { BoundedQueue } from "./queue.ts";
export {
  flushLogs,
  installShutdownHandlers,
  logStats,
  startLogWorker,
} from "./shutdown.ts";
export { PostgresTransport } from "./sinks/postgres.ts";
