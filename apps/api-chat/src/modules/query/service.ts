import { ElysiaCustomStatusResponse, status } from "elysia";
import { ChatMessage } from "../personal-data/chat-messages/service.ts";
import { ChatSession } from "../personal-data/chat-sessions/service.ts";
import { PersonalMemory } from "../personal-data/personal-memory/service.ts";
import { type AppUser } from "../users/service.ts";
import { chatMessages, chatSystem } from "./context.ts";
import { askNeuxus, NeuxusClientError, streamNeuxus } from "./core-client.ts";
import type { QueryModel } from "./model.ts";

const CHAT_MODEL = "deepseek::deepseek-flash";
const CHAT_MAX_TOKENS = 4096;
const STREAM_TIMEOUT_MS = 300_000;

type PreparedAsk = {
  sessionId: string;
  message: string;
  knowledgeBaseId: string;
  requestBody: Record<string, unknown>;
};

async function prepareAsk(
  user: AppUser,
  body: QueryModel["queryBody"],
): Promise<PreparedAsk> {
  const message = body.message.trim();
  if (!message) throw status(400, { error: "message is required" });
  const knowledgeBaseId = body.knowledgeBaseId.trim();
  if (!knowledgeBaseId) {
    throw status(400, { error: "knowledgeBaseId is required" });
  }

  const requested = body.sessionId?.trim();
  let sessionId: string;
  if (requested) {
    const owned = await ChatSession.getOwnedByUser(requested, user.id);
    if (!owned) throw status(404, { error: "Session not found" });
    sessionId = owned.id;
  } else {
    sessionId = await ChatSession.getOrCreate(user.id);
  }

  const recent = await ChatMessage.listRecentBySession(sessionId);
  const memories = await PersonalMemory.search(user.id, message);
  return {
    sessionId,
    message,
    knowledgeBaseId,
    requestBody: {
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      system: chatSystem(memories),
      messages: chatMessages(recent, message),
      metadata: { user_id: user.id },
    },
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export abstract class Query {
  static async ask(user: AppUser, body: QueryModel["queryBody"]) {
    try {
      const prepared = await prepareAsk(user, body);
      const result = await askNeuxus({
        knowledgeBaseId: prepared.knowledgeBaseId,
        body: prepared.requestBody,
      });

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
    }, STREAM_TIMEOUT_MS);

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
          await streamNeuxus({
            knowledgeBaseId: prepared.knowledgeBaseId,
            body: prepared.requestBody,
            signal: abort.signal,
            onText(text) {
              answer += text;
              send("delta", { type: "delta", text });
            },
          });

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
