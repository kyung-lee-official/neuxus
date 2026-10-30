import { status } from "elysia";
import { isoFromDate } from "../../shared/serialize.ts";
import type { QueryModel } from "../query/model.ts";
import { prepareAsk } from "../query/prepare.ts";
import { type AppUser } from "../users/service.ts";
import {
  type AgentRun,
  createAgentRun,
  findRunByIdempotency,
  findRunForUser,
} from "./dal.ts";

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
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

function toView(run: AgentRun): AgentRunView {
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
    createdAt: isoFromDate(run.createdAt),
    updatedAt: isoFromDate(run.updatedAt),
    startedAt: isoFromDate(run.startedAt),
    finishedAt: isoFromDate(run.finishedAt),
  };
}

export function isTerminalStatus(value: string): boolean {
  return value === "completed" || value === "failed";
}

export abstract class AgentRuns {
  static async create(
    user: AppUser,
    body: QueryModel["queryBody"],
  ): Promise<AgentRunView> {
    const idempotencyKey = body.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = await findRunByIdempotency(user.id, idempotencyKey);
      if (existing) return toView(existing);
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
    return toView(run);
  }

  static async get(user: AppUser, runId: string): Promise<AgentRunView> {
    const run = await findRunForUser(runId, user.id);
    if (!run) throw status(404, { error: "Agent run not found" });
    return toView(run);
  }
}
