/**
 * In-process durable-run worker. It claims queued rows from `agent_runs`,
 * resumes from the last transcript checkpoint, and appends events.
 *
 * This is at-least-once execution. A crash during a tool batch can repeat that
 * batch when the run is resumed.
 */

import { AgentSettings } from "../agent-settings/service.ts";
import { runAgent } from "../query/agent.ts";
import { NeuxusClientError } from "../query/core-client.ts";
import {
  type AgentRun,
  appendAgentEvent,
  claimNextQueuedRun,
  completeRun,
  failRun,
  maxEventSeq,
  requeueRunningRuns,
  retryRun,
  updateRunCheckpoint,
} from "./dal.ts";

const POLL_INTERVAL_MS = 500;
let started = false;
let ticking = false;
let timer: ReturnType<typeof setInterval> | null = null;

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryable(error: unknown): boolean {
  return error instanceof NeuxusClientError && error.retryable;
}

async function executeRun(run: AgentRun): Promise<void> {
  let seq = await maxEventSeq(run.id);
  let writeChain: Promise<void> = Promise.resolve();
  const append = (type: string, payload: Record<string, unknown>) => {
    const next = ++seq;
    writeChain = writeChain.then(() =>
      appendAgentEvent(run.id, next, type, payload),
    );
    return writeChain;
  };

  if (seq === 0) {
    await append("start", {
      type: "start",
      sessionId: run.sessionId,
      userId: run.userId,
    });
  }

  const request = isObject(run.request) ? run.request : {};
  const messages = Array.isArray(run.messages) ? run.messages : [];
  const abort = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, AgentSettings.current().streamTimeoutMs);

  try {
    const result = await runAgent({
      knowledgeBaseId: run.knowledgeBaseId,
      requestBody: { ...request, messages },
      userId: run.userId,
      sessionId: run.sessionId,
      stream: true,
      startIteration: run.iteration,
      signal: abort.signal,
      onText(text) {
        void append("delta", { type: "delta", text });
      },
      onTool(event) {
        void append(event.type, { ...event });
      },
      async onCheckpoint(state) {
        await writeChain;
        await updateRunCheckpoint(run.id, state.messages, state.iteration);
      },
    });

    if (result.answer.trim() === "") {
      throw new NeuxusClientError(
        502,
        "neuxus returned an empty answer",
        false,
      );
    }

    await writeChain;
    await completeRun({ run, seq: ++seq, answer: result.answer });
  } catch (error) {
    await writeChain.catch(() => undefined);
    const message = timedOut ? "Run timed out" : errorText(error);
    const attempts = run.attempts + 1;
    if (
      !timedOut &&
      isRetryable(error) &&
      attempts < AgentSettings.current().runMaxAttempts
    ) {
      await retryRun({ run, seq: ++seq, error: message, attempts });
      return;
    }
    await failRun({ run, seq: ++seq, error: message });
  } finally {
    clearTimeout(timeout);
  }
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    for (;;) {
      const run = await claimNextQueuedRun();
      if (!run) break;
      await executeRun(run);
    }
  } catch (error) {
    console.error("agent run worker error", error);
  } finally {
    ticking = false;
  }
}

/** Requeue interrupted runs and start polling. No-op if already started. */
export async function startAgentRunWorker(): Promise<void> {
  if (started) return;
  try {
    await requeueRunningRuns();
  } catch (error) {
    console.warn(
      "agent run worker disabled: agent_runs/agent_events are not ready",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }
  started = true;
  void tick();
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
}

export function stopAgentRunWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
