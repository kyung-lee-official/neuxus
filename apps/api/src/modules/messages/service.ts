/**
 * neuxus synthesis: enrich the current human turn, forward the Anthropic
 * request, validate the response, and attach provenance. Stateless.
 *
 * @see docs/modern-knowledge-base-design/05-synthesis.md
 */

import { ProtocolError } from "../../shared/protocol.ts";
import { KnowledgeBases } from "../knowledge/knowledge-bases/index.ts";
import { Retriever, RetrieverSettings } from "../knowledge/retriever/index.ts";
import type { AnyProvider } from "../model-providers/core/catalog.ts";
import {
  getModelByIdentifier,
  PROVIDERS,
} from "../model-providers/core/catalog.ts";
import { formatKnowledgeBlock } from "./format.ts";
import { neuxusSseStream } from "./stream.ts";
import type {
  JsonObject,
  MessagesHeaders,
  MessagesRequestBody,
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

function providerByModel(identifier: string): AnyProvider | null {
  return (
    PROVIDERS.find((provider) =>
      provider.models.some((model) => model.identifier === identifier),
    ) ?? null
  );
}

function zeroSignals(): NeuxusSignals {
  return { hits: 0, usedParents: 0, topScore: null, margin: null };
}

async function resolveTarget(body: MessagesRequestBody): Promise<{
  provider: AnyProvider;
  model: NonNullable<ReturnType<typeof getModelByIdentifier>>;
}> {
  const model = getModelByIdentifier(body.model);
  if (model?.capabilities.text !== true) {
    throw new ProtocolError(
      404,
      "not_found_error",
      "model_not_found",
      `No text model with id '${body.model}'.`,
    );
  }
  const provider = providerByModel(model.identifier);
  if (!provider) {
    throw new ProtocolError(
      404,
      "not_found_error",
      "model_not_found",
      `No text model with id '${body.model}'.`,
    );
  }
  if (!(await provider.loadConnection())) {
    throw new ProtocolError(
      503,
      "api_error",
      "model_not_configured",
      `Model '${body.model}' has no provider connection.`,
    );
  }
  return { provider, model };
}

export abstract class Messages {
  static async synthesize(input: {
    body: unknown;
    headers: Record<string, unknown>;
    requestId: string;
  }): Promise<JsonObject | Response> {
    const requestHeaders: MessagesHeaders = messagesHeaders(input.headers);
    const body = messagesBody(input.body);

    const knowledgeBase = await KnowledgeBases.get(
      requestHeaders.knowledgeBaseId,
    );
    if (!knowledgeBase) {
      throw new ProtocolError(
        404,
        "not_found_error",
        "knowledge_base_not_found",
        `No knowledge base with id '${requestHeaders.knowledgeBaseId}'.`,
      );
    }
    const { provider, model } = await resolveTarget(body);

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

    if (!human) {
      reason = "no_human_turn";
    } else {
      try {
        const settings = await RetrieverSettings.load();
        const userId =
          typeof body.metadata?.user_id === "string"
            ? body.metadata.user_id
            : undefined;
        const retrieval = await Retriever.parentsByQuestion(human.text, {
          ...settings,
          knowledgeBaseId: requestHeaders.knowledgeBaseId,
          userId,
        });
        hits = retrieval.hits;
        truncated = retrieval.truncated;
        const formatted = formatKnowledgeBlock(
          requestHeaders.knowledgeBaseId,
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
      } catch {
        reason = "retrieval_error";
      }
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
      knowledgeBaseId: requestHeaders.knowledgeBaseId,
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
    const forwardBody = { ...body, messages: enrichedMessages };

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
          body.model,
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
    const response = anthropicMessageResponse(raw, body.model);

    return includeExtension ? { ...response, neuxus: extension } : response;
  }
}
