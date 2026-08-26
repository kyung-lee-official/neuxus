/**
 * logixlysia Transport that pushes every record into a bounded in-memory
 * queue. A background worker drains the queue and INSERTs rows into
 * `app_log`. The transport's `log()` is synchronous and never throws, so
 * logixlysia's request path stays free of DB I/O.
 *
 * The transport does not know the child logger's name (the
 * {@link logixlysia.Transport} interface only carries level / message /
 * meta), so the `name` column is always null for transport-emitted rows.
 */

import { hostname } from "node:os";
import type { LogLevel, Transport } from "logixlysia";
import { db } from "../../db.ts";
import { BoundedQueue, type QueueStats } from "../queue.ts";

const QUEUE_CAPACITY_DEFAULT = 1000;
const DRAIN_BATCH_DEFAULT = 50;
const FLUSH_TIMEOUT_MS_DEFAULT = 2000;

export type PostgresTransportOptions = {
  capacity?: number;
  drainBatch?: number;
  flushTimeoutMs?: number;
};

export type LogRecord = {
  level: string;
  msg: string;
  name: string | null;
  meta: Record<string, unknown>;
  /** Stamped at enqueue time (sync path). */
  time: string;
};

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

export class PostgresTransport implements Transport {
  private readonly queue: BoundedQueue<LogRecord>;
  private readonly drainBatch: number;
  private readonly flushTimeoutMs: number;
  private worker: Promise<void> | null = null;
  private stopped = false;

  constructor(options: PostgresTransportOptions = {}) {
    this.queue = new BoundedQueue<LogRecord>(
      options.capacity ?? QUEUE_CAPACITY_DEFAULT,
    );
    this.drainBatch = options.drainBatch ?? DRAIN_BATCH_DEFAULT;
    this.flushTimeoutMs = options.flushTimeoutMs ?? FLUSH_TIMEOUT_MS_DEFAULT;
  }

  /**
   * logixlysia calls this on every log record. Keep it synchronous and
   * non-throwing — any failure here must not break the request path.
   */
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (this.stopped) return;
    const record: LogRecord = {
      level: normalizeLevel(level),
      msg: message,
      name: null,
      meta: meta ?? {},
      time: new Date().toISOString(),
    };
    try {
      this.queue.enqueue(record);
    } catch {
      // queue.enqueue never throws (capacity validated at construction);
      // defensive catch so a malformed record cannot poison the call site.
    }
  }

  /**
   * Direct enqueue used by the app's own logger (`getRootLogger`,
   * `childLogger`) — carries a `name` so child loggers populate the
   * `app_log.name` column. The logixlysia {@link Transport.log} path
   * always sets `name: null` because the interface has no name slot.
   */
  enqueueDirect(record: LogRecord): void {
    if (this.stopped) return;
    try {
      this.queue.enqueue(record);
    } catch {
      // defensive: see log() above
    }
  }

  /** Start the background worker. Idempotent. */
  start(): void {
    if (this.worker) return;
    this.stopped = false;
    this.worker = this.runWorker();
  }

  /**
   * Dequeue up to `max` records without inserting them. Used by tests to
   * inspect the queue directly; not part of the runtime API.
   */
  drain(max?: number): LogRecord[] {
    return this.queue.drain(max);
  }

  /** Stop the worker and drain the queue. Awaits up to flushTimeoutMs. */
  async flush(timeoutMs?: number): Promise<void> {
    this.stopped = true;
    const budget = timeoutMs ?? this.flushTimeoutMs;
    const worker = this.worker;
    if (!worker) {
      await this.drainOnce();
      return;
    }
    const deadline = Date.now() + budget;
    while (this.queue.stats().depth > 0 && Date.now() < deadline) {
      await this.drainOnce();
    }
    await worker;
    this.worker = null;
  }

  stats(): QueueStats {
    return this.queue.stats();
  }

  private async runWorker(): Promise<void> {
    while (!this.stopped) {
      const drained = await this.drainOnce();
      if (drained === 0) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  /** Returns the number of rows successfully inserted. */
  private async drainOnce(): Promise<number> {
    const batch = this.queue.drain(this.drainBatch);
    if (batch.length === 0) return 0;
    let inserted = 0;
    for (const record of batch) {
      const ok = await this.insertOne(record);
      if (ok) inserted += 1;
    }
    return inserted;
  }

  private async insertOne(record: LogRecord): Promise<boolean> {
    const meta = {
      ...record.meta,
      time: record.time,
      pid: process.pid,
      hostname: hostname(),
    };
    const metaJson = JSON.stringify(meta);
    try {
      await db()`
        INSERT INTO app_log (level, msg, name, meta)
        VALUES (${record.level}, ${record.msg}, ${record.name}, ${metaJson}::jsonb)
      `;
      return true;
    } catch {
      return false;
    }
  }
}
