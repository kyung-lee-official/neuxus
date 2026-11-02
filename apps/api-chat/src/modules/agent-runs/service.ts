import { status } from "elysia";
import { isoFromDate } from "../../shared/serialize.ts";
import type { QueryModel } from "../query/model.ts";
import { prepareAsk } from "../query/prepare.ts";
import { type AppUser } from "../users/service.ts";
import {
  type AgentQuestion,
  type AgentRun,
  answerRunQuestion,
  createAgentRun,
  findPendingQuestionForRun,
  findQuestionForRun,
  findRunByIdempotency,
  findRunForUser,
  markRunCancelled,
  maxEventSeq,
  RunStateConflictError,
  requestRunCancel,
} from "./dal.ts";

export type AgentQuestionView = {
  id: string;
  toolUseId: string;
  question: string;
  header: string | null;
  options: unknown;
  multiple: boolean;
  allowCustom: boolean;
  createdAt: string | null;
};

export type AgentRunView = {
  id: string;
  userId: string;
  sessionId: string;
  knowledgeBaseId: string;
  status: string;
  answer: string | null;
  error: string | null;
  iteration: number;
  attempts: number;
  pendingQuestion: AgentQuestionView | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

function questionView(question: AgentQuestion): AgentQuestionView {
  return {
    id: question.id,
    toolUseId: question.toolUseId,
    question: question.question,
    header: question.header,
    options: question.options,
    multiple: question.multiple,
    allowCustom: question.allowCustom,
    createdAt: isoFromDate(question.createdAt),
  };
}

function toView(
  run: AgentRun,
  pendingQuestion: AgentQuestion | null,
): AgentRunView {
  return {
    id: run.id,
    userId: run.userId,
    sessionId: run.sessionId,
    knowledgeBaseId: run.knowledgeBaseId,
    status: run.status,
    answer: run.answer,
    error: run.error,
    iteration: run.iteration,
    attempts: run.attempts,
    pendingQuestion: pendingQuestion ? questionView(pendingQuestion) : null,
    createdAt: isoFromDate(run.createdAt),
    updatedAt: isoFromDate(run.updatedAt),
    startedAt: isoFromDate(run.startedAt),
    finishedAt: isoFromDate(run.finishedAt),
  };
}

async function viewForRun(run: AgentRun): Promise<AgentRunView> {
  const question = await findPendingQuestionForRun(run.id);
  return toView(run, question);
}

export function isTerminalStatus(value: string): boolean {
  return value === "completed" || value === "failed" || value === "cancelled";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function optionLabels(question: AgentQuestion): string[] {
  if (!Array.isArray(question.options)) return [];
  const labels: string[] = [];
  for (const option of question.options) {
    if (isObject(option) && typeof option.label === "string") {
      labels.push(option.label);
    }
  }
  return labels;
}

function normalizeAnswer(
  question: AgentQuestion,
  answer: string | string[],
): { value: string | string[]; text: string } {
  const raw = Array.isArray(answer) ? answer : [answer];
  const values = raw
    .map((value) => value.trim())
    .filter((value) => value !== "");
  if (values.length === 0) {
    throw status(400, { error: "answer is required" });
  }
  if (!question.multiple && values.length > 1) {
    throw status(400, { error: "only one answer is allowed" });
  }
  if (!question.allowCustom) {
    const labels = optionLabels(question);
    for (const value of values) {
      if (!labels.includes(value)) {
        throw status(400, {
          error: `answer must be one of: ${labels.join(", ")}`,
        });
      }
    }
  }
  return {
    value: Array.isArray(answer) ? values : values.join("\n"),
    text: values.join("\n"),
  };
}

export abstract class AgentRuns {
  static async create(
    user: AppUser,
    body: QueryModel["queryBody"],
  ): Promise<AgentRunView> {
    const idempotencyKey = body.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = await findRunByIdempotency(user.id, idempotencyKey);
      if (existing) return viewForRun(existing);
    }

    const prepared = await prepareAsk(user, body);
    const messages = Array.isArray(prepared.requestBody.messages)
      ? prepared.requestBody.messages
      : [];
    const run = await createAgentRun({
      userId: user.id,
      sessionId: prepared.sessionId,
      knowledgeBaseId: prepared.knowledgeBaseId,
      idempotencyKey,
      message: prepared.message,
      request: prepared.requestBody,
      messages,
    });
    return viewForRun(run);
  }

  static async get(user: AppUser, runId: string): Promise<AgentRunView> {
    const run = await findRunForUser(runId, user.id);
    if (!run) throw status(404, { error: "Agent run not found" });
    return viewForRun(run);
  }

  static async answer(
    user: AppUser,
    runId: string,
    questionId: string,
    answer: string | string[],
  ): Promise<AgentRunView> {
    const run = await findRunForUser(runId, user.id);
    if (!run) throw status(404, { error: "Agent run not found" });
    if (run.status !== "waiting") {
      throw status(409, { error: "Agent run is not waiting for an answer" });
    }
    const question = await findQuestionForRun(run.id, questionId);
    if (question?.status !== "pending") {
      throw status(404, { error: "Pending question not found" });
    }
    const normalized = normalizeAnswer(question, answer);
    const seq = (await maxEventSeq(run.id)) + 1;
    try {
      await answerRunQuestion({
        run,
        question,
        seq,
        answerValue: normalized.value,
        answerText: normalized.text,
      });
    } catch (error) {
      if (error instanceof RunStateConflictError) {
        throw status(409, { error: error.message });
      }
      throw error;
    }
    const updated = await findRunForUser(runId, user.id);
    if (!updated) throw status(404, { error: "Agent run not found" });
    return viewForRun(updated);
  }

  static async cancel(user: AppUser, runId: string): Promise<AgentRunView> {
    const run = await findRunForUser(runId, user.id);
    if (!run) throw status(404, { error: "Agent run not found" });
    if (isTerminalStatus(run.status)) return viewForRun(run);

    if (run.status === "running") {
      await requestRunCancel(run.id);
      return viewForRun(run);
    }

    const seq = (await maxEventSeq(run.id)) + 1;
    const cancelled = await markRunCancelled({
      run,
      seq,
      expectedStatus: run.status,
    });
    const updated = await findRunForUser(runId, user.id);
    if (!updated) throw status(404, { error: "Agent run not found" });
    if (!cancelled && updated.status === "running") {
      await requestRunCancel(updated.id);
      const requested = await findRunForUser(runId, user.id);
      return viewForRun(requested ?? updated);
    }
    return viewForRun(updated);
  }
}
