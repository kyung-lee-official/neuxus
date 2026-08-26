/**
 * Process-level lifecycle helpers: start the worker, drain on demand,
 * read stats, install SIGTERM/SIGINT handlers. All functions are
 * idempotent so callers can be sloppy at the call site.
 */

import { getLogTransport } from "./logger.ts";

const DEFAULT_TIMEOUT_MS = 2000;

function envTimeoutMs(): number {
  const raw = process.env.LOG_DRAIN_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TIMEOUT_MS;
  return n;
}

export function startLogWorker(): void {
  getLogTransport().start();
}

export function flushLogs(timeoutMs?: number): Promise<void> {
  return getLogTransport().flush(timeoutMs ?? envTimeoutMs());
}

export function logStats(): {
  capacity: number;
  depth: number;
  droppedTotal: number;
} {
  return getLogTransport().stats();
}

let installed = false;

export function installShutdownHandlers(): void {
  if (installed) return;
  installed = true;

  const onSignal = (_signal: NodeJS.Signals) => {
    void (async () => {
      try {
        await getLogTransport().flush(envTimeoutMs());
      } catch {
        // flush() never throws; defensive catch.
      }
      process.exit(0);
    })();
  };

  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}
