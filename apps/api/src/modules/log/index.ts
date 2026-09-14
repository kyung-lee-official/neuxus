/**
 * Public app-logger API.
 *
 * The logger is generic and business-agnostic; call sites import from here:
 *
 * ```ts
 * import { Logger } from "modules/log";
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
export { Logger } from "./logger.ts";
export { BoundedQueue } from "./queue.ts";
export { type AdminLogSettings, LogSettings } from "./service.ts";
export { PostgresTransport } from "./sinks/postgres.ts";
