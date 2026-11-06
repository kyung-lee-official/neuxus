/**
 * Durable agent-run storage. A run owns a transcript checkpoint and an
 * append-only event log. Events use a monotonic `seq` per run.
 */

import { Prisma } from "../../generated/prisma/client.ts";
import { getPrisma } from "../../shared/db.ts";
import type { QuestionInput } from "../tools/index.ts";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentRun = Prisma.AgentRunModel;
export type AgentEvent = Prisma.AgentEventModel;
export type AgentQuestion = Prisma.AgentQuestionModel;

export class RunStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunStateConflictError";
  }
}

export async function createAgentRun(input: {
  userId: string;
  sessionId: string;
  knowledgeBaseIds: string[];
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
        knowledgeBaseIds: input.knowledgeBaseIds,
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

/** Startup readiness probe for the question table. */
export async function agentQuestionsReady(): Promise<void> {
  await getPrisma().agentQuestion.findFirst({ select: { id: true } });
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

export async function findPendingQuestionForRun(
  runId: string,
): Promise<AgentQuestion | null> {
  return getPrisma().agentQuestion.findFirst({
    where: { runId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
}

export async function findQuestionForRun(
  runId: string,
  questionId: string,
): Promise<AgentQuestion | null> {
  return getPrisma().agentQuestion.findFirst({
    where: { id: questionId, runId },
  });
}

export async function isCancelRequested(runId: string): Promise<boolean> {
  const run = await getPrisma().agentRun.findUnique({
    where: { id: runId },
    select: { cancelRequestedAt: true },
  });
  return run?.cancelRequestedAt != null;
}

export async function pauseRunForQuestion(input: {
  run: AgentRun;
  seq: number;
  toolUseId: string;
  question: QuestionInput;
  assistantContent: unknown;
}): Promise<AgentQuestion> {
  return getPrisma().$transaction(async (tx) => {
    const question = await tx.agentQuestion.create({
      data: {
        runId: input.run.id,
        toolUseId: input.toolUseId,
        question: input.question.question,
        header: input.question.header ?? null,
        options: input.question.options
          ? (input.question.options as Prisma.InputJsonValue)
          : Prisma.DbNull,
        multiple: input.question.multiple,
        allowCustom: input.question.allowCustom,
      },
    });
    await tx.agentRun.update({
      where: { id: input.run.id },
      data: {
        status: "waiting",
        pendingAssistant: input.assistantContent as Prisma.InputJsonValue,
        pendingQuestionId: question.id,
        error: null,
      },
    });
    await tx.agentEvent.create({
      data: {
        runId: input.run.id,
        seq: input.seq,
        type: "question",
        payload: {
          type: "question",
          questionId: question.id,
          toolUseId: question.toolUseId,
          question: question.question,
          ...(question.header ? { header: question.header } : {}),
          ...(question.options ? { options: question.options } : {}),
          multiple: question.multiple,
          allowCustom: question.allowCustom,
        } as Prisma.InputJsonValue,
      },
    });
    return question;
  });
}

export async function answerRunQuestion(input: {
  run: AgentRun;
  question: AgentQuestion;
  seq: number;
  answerValue: string | string[];
  answerText: string;
}): Promise<void> {
  const assistantContent = input.run.pendingAssistant;
  if (assistantContent == null) {
    throw new Error("Run has no pending assistant content");
  }
  const messages = Array.isArray(input.run.messages)
    ? [...input.run.messages]
    : [];
  messages.push(
    { role: "assistant", content: assistantContent },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: input.question.toolUseId,
          content: `User answer:\n${input.answerText}`,
        },
      ],
    },
  );

  await getPrisma().$transaction(async (tx) => {
    const updatedQuestion = await tx.agentQuestion.updateMany({
      where: { id: input.question.id, status: "pending" },
      data: {
        status: "answered",
        answer: input.answerValue as Prisma.InputJsonValue,
        answeredAt: new Date(),
      },
    });
    if (updatedQuestion.count === 0) {
      throw new RunStateConflictError("Question is no longer pending");
    }

    const updatedRun = await tx.agentRun.updateMany({
      where: { id: input.run.id, status: "waiting" },
      data: {
        status: "queued",
        messages: messages as Prisma.InputJsonValue,
        iteration: input.run.iteration + 1,
        pendingAssistant: Prisma.DbNull,
        pendingQuestionId: null,
        error: null,
        finishedAt: null,
      },
    });
    if (updatedRun.count === 0) {
      throw new RunStateConflictError("Agent run is no longer waiting");
    }

    await tx.agentEvent.create({
      data: {
        runId: input.run.id,
        seq: input.seq,
        type: "tool_result",
        payload: {
          type: "tool_result",
          id: input.question.toolUseId,
          name: "question",
          isError: false,
          preview: input.answerText.slice(0, 500),
        } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function markRunCancelled(input: {
  run: AgentRun;
  seq: number;
  expectedStatus?: string;
}): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.agentRun.updateMany({
      where: input.expectedStatus
        ? { id: input.run.id, status: input.expectedStatus }
        : { id: input.run.id },
      data: {
        status: "cancelled",
        pendingAssistant: Prisma.DbNull,
        pendingQuestionId: null,
        finishedAt: new Date(),
      },
    });
    if (updated.count === 0) return false;

    await tx.agentQuestion.updateMany({
      where: { runId: input.run.id, status: "pending" },
      data: { status: "cancelled", answeredAt: new Date() },
    });
    await tx.agentEvent.create({
      data: {
        runId: input.run.id,
        seq: input.seq,
        type: "cancelled",
        payload: { type: "cancelled" } as Prisma.InputJsonValue,
      },
    });
    return true;
  });
}

export async function requestRunCancel(runId: string): Promise<void> {
  await getPrisma().agentRun.update({
    where: { id: runId },
    data: { cancelRequestedAt: new Date() },
  });
}
