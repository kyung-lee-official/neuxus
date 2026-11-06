/**
 * neuxus synthesis: enrich the current human turn, forward the Anthropic
 * request, validate the response, and attach provenance. Stateless.
 *
 * @see docs/modern-knowledge-base-design/05-synthesis.md
 */

import type { KnowledgeWarning } from "../../shared/knowledge.ts";
import { ProtocolError } from "../../shared/protocol.ts";
import { KnowledgeBases } from "../knowledge/knowledge-bases/index.ts";
import { Retriever, RetrieverSettings } from "../knowledge/retriever/index.ts";
import { logRetrievalWarnings } from "../knowledge/retriever/warnings.ts";
import {
  resolveTaskModelLink,
  TASK_TEXT_SYNTHESIS,
} from "../server-setting/task-model-map/service.ts";
import { formatKnowledgeBlock } from "./format.ts";
import { neuxusSseStream } from "./stream.ts";
import type {
  JsonObject,
  MessagesHeaders,
  NeuxusExtension,
  NeuxusSignals,
} from "./types.ts";
import {
  humanTurnFrom,
  messagesBody,
  messagesHeaders,
  messagesWithKnowledge,
} from "./validate.ts";
import { anthropicMessageResponse } from "./validate-response.ts";

function zeroSignals(): NeuxusSignals {
  return { hits: 0, usedParents: 0, topScore: null, margin: null };
}

async function resolveTarget(): Promise<
  NonNullable<Awaited<ReturnType<typeof resolveTaskModelLink>>>
> {
  const link = await resolveTaskModelLink(TASK_TEXT_SYNTHESIS);
  if (!link) {
    throw new ProtocolError(
      503,
      "api_error",
      "model_not_configured",
      `No model is configured for '${TASK_TEXT_SYNTHESIS}'.`,
    );
  }
  if (!(await link.provider.loadConnection())) {
    throw new ProtocolError(
      503,
      "api_error",
      "model_not_configured",
      `Model '${link.model.identifier}' has no provider connection.`,
    );
  }
  return link;
}

export abstract class Messages {
  static async synthesize(input: {
    body: unknown;
    headers: Record<string, unknown>;
    requestId: string;
  }): Promise<JsonObject | Response> {
    const requestHeaders: MessagesHeaders = messagesHeaders(input.headers);
    const body = messagesBody(input.body);
    const requestedKnowledgeBaseIds = body.knowledgeBaseIds;

    const { found, missing } = await KnowledgeBases.getMany(
      requestedKnowledgeBaseIds,
    );
    if (found.length === 0) {
      throw new ProtocolError(
        404,
        "not_found_error",
        "knowledge_base_not_found",
        `No knowledge base found: ${missing.join(", ")}.`,
      );
    }

    const warnings: KnowledgeWarning[] = missing.map((knowledgeBaseId) => ({
      code: "knowledge_base_not_found",
      knowledgeBaseId,
      message: `No knowledge base with id '${knowledgeBaseId}'.`,
    }));
    const validKnowledgeBaseIds = found.map((kb) => kb.id);

    const { provider, model } = await resolveTarget();

    const human = humanTurnFrom(body.messages);
    let reason: NeuxusExtension["enrichment"]["reason"];
    let enrichedMessages = body.messages;
    let block: string | null = null;
    let sources: NeuxusExtension["sources"] = [];
    let hits = 0;
    let truncated = false;
    let usedParents = 0;
    let topScore: number | null = null;
    let margin: number | null = null;
    let searchedKnowledgeBaseIds: string[] = [];

    if (!human) {
      reason = "no_human_turn";
    } else {
      const settings = await RetrieverSettings.load();
      const userId =
        typeof body.metadata?.user_id === "string"
          ? body.metadata.user_id
          : undefined;
      const startedAt = performance.now();
      const retrieval = await Retriever.parentsByQuestion(human.text, {
        ...settings,
        knowledgeBaseIds: validKnowledgeBaseIds,
        userId,
      });
      warnings.push(...retrieval.warnings);
      searchedKnowledgeBaseIds = retrieval.searchedKnowledgeBaseIds;
      hits = retrieval.hits;
      truncated = retrieval.truncated;

      if (searchedKnowledgeBaseIds.length === 0) {
        throw new ProtocolError(
          500,
          "api_error",
          "internal_error",
          "All requested knowledge bases failed retrieval.",
        );
      }

      const formatted = formatKnowledgeBlock(
        searchedKnowledgeBaseIds,
        retrieval.parents,
        retrieval.images,
      );
      if (formatted) {
        block = formatted.block;
        sources = formatted.sources;
        usedParents = retrieval.parents.length;
        topScore = retrieval.parents[0]?.score ?? null;
        const [first, second] = retrieval.parents;
        if (first && second) {
          margin = first.score - second.score;
        }
        enrichedMessages = messagesWithKnowledge(body.messages, human, block);
      } else {
        reason = "no_hits";
      }

      logRetrievalWarnings({
        userId,
        requestedKnowledgeBaseIds,
        warnings,
        embeddingModel: retrieval.currentModel,
        hits,
        latencyMs: Math.round(performance.now() - startedAt),
      });
    }

    const upstreamHeaders: Record<string, string> = {
      "anthropic-version": requestHeaders.anthropicVersion,
    };
    if (requestHeaders.anthropicBeta !== "") {
      upstreamHeaders["anthropic-beta"] = requestHeaders.anthropicBeta;
    }

    const enriched = block !== null;
    const signals: NeuxusSignals = enriched
      ? { hits, usedParents, topScore, margin }
      : zeroSignals();
    const extension: NeuxusExtension = {
      protocolVersion: "1",
      requestId: input.requestId,
      knowledgeBaseIds: requestedKnowledgeBaseIds,
      searchedKnowledgeBaseIds,
      ...(warnings.length > 0 ? { warnings } : {}),
      enriched,
      enrichment: {
        turnIndex: human?.index ?? null,
        injectedChars: block?.length ?? 0,
        ...(enriched ? {} : { reason }),
        truncated: enriched ? truncated : false,
      },
      upstream: { provider: provider.id, model: model.modelId },
      sources,
      signals,
    };
    const includeExtension = requestHeaders.extensions !== "none";
    const { knowledgeBaseIds: _knowledgeBaseIds, ...forwardBodyBase } = body;
    const forwardBody = {
      ...forwardBodyBase,
      model: model.modelId,
      messages: enrichedMessages,
    };

    if (body.stream === true) {
      let upstream: Response;
      try {
        upstream = await provider.forwardMessagesStream(
          model.modelId,
          forwardBody,
          upstreamHeaders,
        );
      } catch {
        throw new ProtocolError(
          502,
          "api_error",
          "upstream_error",
          "Upstream model request failed.",
        );
      }
      if (!upstream.body) {
        throw new ProtocolError(
          502,
          "api_error",
          "non_anthropic_upstream",
          "Upstream did not return an event stream.",
        );
      }
      const contentType = upstream.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        await upstream.body.cancel();
        throw new ProtocolError(
          502,
          "api_error",
          "non_anthropic_upstream",
          "Upstream did not return an Anthropic event stream.",
        );
      }
      const headers = new Headers(upstream.headers);
      headers.set("content-type", "text/event-stream; charset=utf-8");
      headers.set("cache-control", "no-cache");
      headers.set("X-Request-Id", input.requestId);
      return new Response(
        neuxusSseStream(
          upstream.body as ReadableStream<Uint8Array>,
          extension,
          includeExtension,
          model.identifier,
        ),
        { status: upstream.status, headers },
      );
    }

    let raw: unknown;
    try {
      raw = await provider.forwardMessages(
        model.modelId,
        forwardBody,
        upstreamHeaders,
      );
    } catch {
      throw new ProtocolError(
        502,
        "api_error",
        "upstream_error",
        "Upstream model request failed.",
      );
    }
    const response = anthropicMessageResponse(raw, model.identifier);

    return includeExtension ? { ...response, neuxus: extension } : response;
  }
}
