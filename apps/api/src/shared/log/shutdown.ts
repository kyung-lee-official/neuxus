/**
 * Process-level lifecycle helpers: start the worker, drain on demand,
 * read stats, install SIGTERM/SIGINT handlers. All functions are
 * idempotent so callers can be sloppy at the call site.
 */

import { getLogTransport } from "./logger.ts";

export function startLogWorker(): void {
  getLogTransport().start();
}

export function flushLogs(timeoutMs: number): Promise<void> {
  return getLogTransport().flush(timeoutMs);
}

export function logStats(): {
  capacity: number;
  depth: number;
  droppedTotal: number;
} {
  return getLogTransport().stats();
}

let installed = false;

export function installShutdownHandlers(timeoutMs: number): void {
  if (installed) return;
  installed = true;

  const onSignal = (_signal: NodeJS.Signals) => {
    void (async () => {
      try {
        await getLogTransport().flush(timeoutMs);
      } catch {
        // flush() never throws; defensive catch.
      }
      process.exit(0);
    })();
  };

  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}
