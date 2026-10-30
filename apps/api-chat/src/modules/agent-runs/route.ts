import { Elysia, status } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { QueryModel } from "../query/model.ts";
import { findRunForUser, listEventsAfter } from "./dal.ts";
import { AgentRuns, isTerminalStatus } from "./service.ts";

const EVENT_POLL_MS = 300;

function parseSeq(raw: string | null): number {
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runEventsStream(input: {
  runId: string;
  userId: string;
  after: number;
  signal: AbortSignal;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  const abort = () => {
    closed = true;
  };
  input.signal.addEventListener("abort", abort, { once: true });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: { seq: number; type: string; payload: unknown }) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(
            `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`,
          ),
        );
      };

      let last = input.after;
      try {
        while (!closed) {
          const events = await listEventsAfter(input.runId, last);
          for (const event of events) {
            last = event.seq;
            send({
              seq: event.seq,
              type: event.type,
              payload: event.payload,
            });
          }

          const current = await findRunForUser(input.runId, input.userId);
          if (!current) {
            send({
              seq: last + 1,
              type: "error",
              payload: {
                type: "error",
                error: "Agent run not found",
              },
            });
            break;
          }
          if (isTerminalStatus(current.status)) break;
          await new Promise((resolve) => setTimeout(resolve, EVENT_POLL_MS));
        }
      } catch (error) {
        if (!closed) {
          send({
            seq: last + 1,
            type: "error",
            payload: { type: "error", error: errorText(error) },
          });
        }
      } finally {
        input.signal.removeEventListener("abort", abort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* client already closed */
          }
        }
      }
    },
    cancel() {
      closed = true;
      input.signal.removeEventListener("abort", abort);
    },
  });
}

/** Durable agent-run endpoints. */
export const agentRuns = new Elysia()
  .use(auth)
  .post(
    "/query/async",
    async ({ user, body }) => status(202, await AgentRuns.create(user, body)),
    {
      requireUser: true,
      body: QueryModel.queryBody,
      detail: {
        tags: [API_TAGS.query],
        summary: "Create a durable agent run",
        description:
          "Queues a tool-loop run, optionally reusing `idempotencyKey`, and returns the run id. Follow `GET /query/runs/:id/events` for progress.",
        security: [bearerSecurity],
      },
    },
  )
  .get(
    "/query/runs/:runId",
    ({ user, params }) => AgentRuns.get(user, params.runId),
    {
      requireUser: true,
      detail: {
        tags: [API_TAGS.query],
        summary: "Read a durable agent run",
        security: [bearerSecurity],
      },
    },
  )
  .get(
    "/query/runs/:runId/events",
    async ({ user, params, request, set }) => {
      const run = await findRunForUser(params.runId, user.id);
      if (!run) throw status(404, { error: "Agent run not found" });

      const url = new URL(request.url);
      const after = parseSeq(
        request.headers.get("last-event-id") ?? url.searchParams.get("after"),
      );

      set.headers["content-type"] = "text/event-stream; charset=utf-8";
      set.headers["cache-control"] = "no-cache";
      set.headers["X-Accel-Buffering"] = "no";
      return runEventsStream({
        runId: run.id,
        userId: user.id,
        after,
        signal: request.signal,
      });
    },
    {
      requireUser: true,
      detail: {
        tags: [API_TAGS.query],
        summary: "Follow durable agent-run events",
        description:
          "Replays events after `Last-Event-ID` or `?after=`, then follows new events until the run completes or fails.",
        security: [bearerSecurity],
      },
    },
  );
