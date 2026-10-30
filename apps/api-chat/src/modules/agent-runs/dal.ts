/**
 * Durable agent-run storage. A run owns a transcript checkpoint and an
 * append-only event log. Events use a monotonic `seq` per run.
 */

import { Prisma } from "../../generated/prisma/client.ts";
import { getPrisma } from "../../shared/db.ts";

export type AgentRunStatus = "queued" | "running" | "completed" | "failed";

export type AgentRun = Prisma.AgentRunModel;
export type AgentEvent = Prisma.AgentEventModel;

export async function createAgentRun(input: {
  userId: string;
  sessionId: string;
  knowledgeBaseId: string;
  idempotencyKey?: string | null;
  message: string;
  request: Record<string, unknown>;
  messages: unknown[];
}): Promise<AgentRun> {
  const prisma = getPrisma();
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const existing = await prisma.agentRun.findFirst({
      where: { userId: input.userId, idempotencyKey },
    });
    if (existing) return existing;
  }

  try {
    return await prisma.agentRun.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        knowledgeBaseId: input.knowledgeBaseId,
        idempotencyKey,
        message: input.message,
        request: input.request as Prisma.InputJsonValue,
        messages: input.messages as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (idempotencyKey) {
      const existing = await prisma.agentRun.findFirst({
        where: { userId: input.userId, idempotencyKey },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function findRunForUser(
  runId: string,
  userId: string,
): Promise<AgentRun | null> {
  return getPrisma().agentRun.findFirst({ where: { id: runId, userId } });
}

export async function findRunByIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<AgentRun | null> {
  return getPrisma().agentRun.findFirst({
    where: { userId, idempotencyKey },
  });
}

export async function findRun(runId: string): Promise<AgentRun | null> {
  return getPrisma().agentRun.findUnique({ where: { id: runId } });
}

export async function requeueRunningRuns(): Promise<number> {
  const result = await getPrisma().agentRun.updateMany({
    where: { status: "running" },
    data: { status: "queued" },
  });
  return result.count;
}

export async function claimNextQueuedRun(): Promise<AgentRun | null> {
  const prisma = getPrisma();
  const candidate = await prisma.agentRun.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;

  const claimed = await prisma.agentRun.updateMany({
    where: { id: candidate.id, status: "queued" },
    data: {
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
    },
  });
  if (claimed.count === 0) return null;
  return findRun(candidate.id);
}

export async function maxEventSeq(runId: string): Promise<number> {
  const result = await getPrisma().agentEvent.aggregate({
    where: { runId },
    _max: { seq: true },
  });
  return result._max.seq ?? 0;
}

export async function appendAgentEvent(
  runId: string,
  seq: number,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await getPrisma().agentEvent.create({
    data: {
      runId,
      seq,
      type,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

export async function updateRunCheckpoint(
  runId: string,
  messages: unknown[],
  iteration: number,
): Promise<void> {
  await getPrisma().agentRun.update({
    where: { id: runId },
    data: {
      messages: messages as Prisma.InputJsonValue,
      iteration,
    },
  });
}

export async function listEventsAfter(
  runId: string,
  after: number,
): Promise<AgentEvent[]> {
  return getPrisma().agentEvent.findMany({
    where: { runId, seq: { gt: after } },
    orderBy: { seq: "asc" },
  });
}

export async function completeRun(input: {
  run: AgentRun;
  seq: number;
  answer: string;
}): Promise<void> {
  const { run, seq, answer } = input;
  await getPrisma().$transaction(async (tx) => {
    await tx.message.create({
      data: {
        sessionId: run.sessionId,
        role: "user",
        content: run.message,
      },
    });
    await tx.message.create({
      data: {
        sessionId: run.sessionId,
        role: "assistant",
        content: answer,
      },
    });
    await tx.session.update({
      where: { id: run.sessionId },
      data: { updatedAt: new Date() },
    });
    await tx.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        answer,
        error: null,
        finishedAt: new Date(),
      },
    });
    await tx.agentEvent.create({
      data: {
        runId: run.id,
        seq,
        type: "done",
        payload: {
          type: "done",
          sessionId: run.sessionId,
          userId: run.userId,
        } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function failRun(input: {
  run: AgentRun;
  seq: number;
  error: string;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await tx.agentRun.update({
      where: { id: input.run.id },
      data: {
        status: "failed",
        error: input.error,
        finishedAt: new Date(),
      },
    });
    await tx.agentEvent.create({
      data: {
        runId: input.run.id,
        seq: input.seq,
        type: "error",
        payload: {
          type: "error",
          error: input.error,
        } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function retryRun(input: {
  run: AgentRun;
  seq: number;
  error: string;
  attempts: number;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await tx.agentRun.update({
      where: { id: input.run.id },
      data: {
        status: "queued",
        attempts: input.attempts,
        error: input.error,
      },
    });
    await tx.agentEvent.create({
      data: {
        runId: input.run.id,
        seq: input.seq,
        type: "retry",
        payload: {
          type: "retry",
          error: input.error,
          attempt: input.attempts,
        } as Prisma.InputJsonValue,
      },
    });
  });
}
