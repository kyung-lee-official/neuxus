import { ElysiaCustomStatusResponse, status } from "elysia";
import { AgentSettings } from "../agent-settings/service.ts";
import { ChatMessage } from "../personal-data/chat-messages/service.ts";
import { PersonalMemory } from "../personal-data/personal-memory/service.ts";
import { type AppUser } from "../users/service.ts";
import { runAgent } from "./agent.ts";
import { NeuxusClientError } from "./core-client.ts";
import type { QueryModel } from "./model.ts";
import { prepareAsk } from "./prepare.ts";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export abstract class Query {
  static async ask(user: AppUser, body: QueryModel["queryBody"]) {
    try {
      const prepared = await prepareAsk(user, body);
      const result = await runAgent({
        knowledgeBaseId: prepared.knowledgeBaseId,
        requestBody: prepared.requestBody,
        userId: user.id,
        sessionId: prepared.sessionId,
        stream: false,
      });
      if (result.answer.trim() === "") {
        throw new NeuxusClientError(502, "neuxus returned an empty answer");
      }

      await ChatMessage.insert(prepared.sessionId, "user", prepared.message);
      await ChatMessage.insert(prepared.sessionId, "assistant", result.answer);
      return {
        userId: user.id,
        sessionId: prepared.sessionId,
        mode: "ask" as const,
        answer: result.answer,
      };
    } catch (err) {
      if (err instanceof ElysiaCustomStatusResponse) throw err;
      if (err instanceof NeuxusClientError) {
        const statusCode =
          err.status === 401 || err.status === 403 ? 502 : err.status;
        throw status(statusCode, { error: err.message });
      }
      throw status(502, { error: errorText(err) });
    }
  }

  /** Stream chat events; persist the answer only after a complete stream. */
  static async askStream(
    user: AppUser,
    body: QueryModel["queryBody"],
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const prepared = await prepareAsk(user, body);
    const abort = new AbortController();
    const forwardAbort = () => abort.abort();
    if (signal) {
      if (signal.aborted) abort.abort();
      else signal.addEventListener("abort", forwardAbort, { once: true });
    }
    const encoder = new TextEncoder();
    let closed = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, AgentSettings.current().streamTimeoutMs);

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          } catch {
            closed = true;
            abort.abort();
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* the client already closed the stream */
          }
        };

        send("start", {
          type: "start",
          sessionId: prepared.sessionId,
          userId: user.id,
        });

        let answer = "";
        try {
          const result = await runAgent({
            knowledgeBaseId: prepared.knowledgeBaseId,
            requestBody: prepared.requestBody,
            userId: user.id,
            sessionId: prepared.sessionId,
            stream: true,
            signal: abort.signal,
            onText(text) {
              send("delta", { type: "delta", text });
            },
            onTool(event) {
              send(event.type, { ...event });
            },
          });
          answer = result.answer;

          if (abort.signal.aborted) {
            close();
            return;
          }
          if (answer.trim() === "") {
            throw new NeuxusClientError(502, "neuxus returned an empty answer");
          }

          await ChatMessage.insert(
            prepared.sessionId,
            "user",
            prepared.message,
          );
          await ChatMessage.insert(prepared.sessionId, "assistant", answer);
          send("done", {
            type: "done",
            sessionId: prepared.sessionId,
            userId: user.id,
          });
          close();
        } catch (err) {
          if (!abort.signal.aborted || timedOut) {
            send("error", {
              type: "error",
              error: timedOut ? "Stream timed out" : errorText(err),
            });
          }
          close();
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", forwardAbort);
        }
      },
      cancel() {
        closed = true;
        abort.abort();
        clearTimeout(timeout);
        signal?.removeEventListener("abort", forwardAbort);
      },
    });
  }

  static async remember(user: AppUser, body: QueryModel["rememberBody"]) {
    const content = body.content.trim();
    if (!content) throw status(400, { error: "content is required" });
    const memory = await PersonalMemory.upsert(user.id, content);
    return {
      userId: user.id,
      slug: memory.slug,
      saved: true as const,
    };
  }
}
