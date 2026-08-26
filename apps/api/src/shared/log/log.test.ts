import { beforeEach, describe, expect, test } from "bun:test";
import {
  LOG_DEFAULTS,
  type LogSettingsRow,
  resolveLogSettings,
} from "./defaults.ts";
import {
  childLogger,
  getLogTransport,
  getRootLogger,
  setLogTransport,
} from "./logger.ts";
import { BoundedQueue } from "./queue.ts";
import { PostgresTransport } from "./sinks/postgres.ts";

describe("BoundedQueue", () => {
  test("enqueues and drains in FIFO order", () => {
    const q = new BoundedQueue<number>(4);
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    expect(q.drain()).toEqual([1, 2, 3]);
    expect(q.stats().depth).toBe(0);
  });

  test("drops the oldest when over capacity", () => {
    const q = new BoundedQueue<number>(2);
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);
    q.enqueue(5);
    expect(q.drain()).toEqual([4, 5]);
    expect(q.stats().droppedTotal).toBe(3);
    expect(q.stats().capacity).toBe(2);
  });

  test("rejects non-positive capacity", () => {
    expect(() => new BoundedQueue<number>(0)).toThrow();
    expect(() => new BoundedQueue<number>(-1)).toThrow();
  });

  test("drain limit caps the batch", () => {
    const q = new BoundedQueue<number>(10);
    for (let i = 0; i < 10; i += 1) q.enqueue(i);
    expect(q.drain(3)).toEqual([0, 1, 2]);
    expect(q.stats().depth).toBe(7);
  });

  test("drain on empty returns []", () => {
    const q = new BoundedQueue<number>(4);
    expect(q.drain()).toEqual([]);
    expect(q.drain(10)).toEqual([]);
  });
});

describe("AppLogger", () => {
  beforeEach(() => {
    setLogTransport(new PostgresTransport());
    getLogTransport().drain(10_000);
  });

  test("getRootLogger().info enqueues one record with the right shape", () => {
    getRootLogger().info("hello world", { requestId: "abc" });

    const drained = getLogTransport().drain(10);
    expect(drained).toHaveLength(1);
    const record = drained[0]!;
    expect(record.level).toBe("info");
    expect(record.msg).toBe("hello world");
    expect(record.name).toBeNull();
    expect(record.meta.requestId).toBe("abc");
    expect(typeof record.time).toBe("string");
  });

  test("childLogger merges bindings and stamps name", () => {
    const log = childLogger({ module: "synthesis" }, "synthesis");
    log.warn("slow request", { latencyMs: 1500 });

    const drained = getLogTransport().drain(10);
    expect(drained).toHaveLength(1);
    const record = drained[0]!;
    expect(record.level).toBe("warn");
    expect(record.name).toBe("synthesis");
    expect(record.meta.module).toBe("synthesis");
    expect(record.meta.latencyMs).toBe(1500);
  });

  test("nested children stack bindings and keep the outermost name", () => {
    const a = childLogger({ module: "auth" }, "auth");
    const b = a.child({ step: "verify" });
    b.error("denied");

    const drained = getLogTransport().drain(10);
    expect(drained).toHaveLength(1);
    const record = drained[0]!;
    expect(record.name).toBe("auth");
    expect(record.meta.module).toBe("auth");
    expect(record.meta.step).toBe("verify");
  });
});

describe("resolveLogSettings", () => {
  test("returns LOG_DEFAULTS when row is null/undefined", () => {
    expect(resolveLogSettings(null)).toEqual(LOG_DEFAULTS);
    expect(resolveLogSettings(undefined)).toEqual(LOG_DEFAULTS);
  });

  test("returns LOG_DEFAULTS when every column is null", () => {
    const row: LogSettingsRow = {
      sinks: null,
      queueSize: null,
      drainTimeoutMs: null,
      pretty: null,
    };
    expect(resolveLogSettings(row)).toEqual(LOG_DEFAULTS);
  });

  test("DB row overrides defaults; missing columns fall back", () => {
    const row: LogSettingsRow = {
      sinks: ["postgres"],
      queueSize: 500,
    };
    const resolved = resolveLogSettings(row);
    expect(resolved.sinks).toEqual(["postgres"]);
    expect(resolved.queueSize).toBe(500);
    expect(resolved.drainTimeoutMs).toBe(LOG_DEFAULTS.drainTimeoutMs);
    expect(resolved.pretty).toBe(LOG_DEFAULTS.pretty);
  });

  test("ignores unknown sink values and dedupes", () => {
    const row: LogSettingsRow = {
      sinks: ["postgres", "postgres", "invalid", "console", ""],
    };
    expect(resolveLogSettings(row).sinks).toEqual(["postgres", "console"]);
  });

  test("empty / blank sink array falls back to defaults", () => {
    expect(resolveLogSettings({ sinks: [] }).sinks).toEqual([
      ...LOG_DEFAULTS.sinks,
    ]);
  });

  test("non-positive integers fall back to defaults", () => {
    expect(resolveLogSettings({ queueSize: 0 }).queueSize).toBe(
      LOG_DEFAULTS.queueSize,
    );
    expect(resolveLogSettings({ queueSize: -5 }).queueSize).toBe(
      LOG_DEFAULTS.queueSize,
    );
    expect(resolveLogSettings({ drainTimeoutMs: 0 }).drainTimeoutMs).toBe(
      LOG_DEFAULTS.drainTimeoutMs,
    );
  });

  test("non-boolean pretty falls back to default", () => {
    expect(
      resolveLogSettings({ pretty: "yes" as unknown as boolean }).pretty,
    ).toBe(LOG_DEFAULTS.pretty);
  });
});
