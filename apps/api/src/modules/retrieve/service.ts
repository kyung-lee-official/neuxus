/**
 * Evidence-only retrieval endpoint: same retrieval as `/v1/messages`, but no
 * model call and no enrichment.
 */

import type { KnowledgeWarning } from "../../shared/knowledge.ts";
import { ProtocolError } from "../../shared/protocol.ts";
import { KnowledgeBases } from "../knowledge/knowledge-bases/index.ts";
import { Retriever, RetrieverSettings } from "../knowledge/retriever/index.ts";
import { logRetrievalWarnings } from "../knowledge/retriever/warnings.ts";

type RetrieveBody = {
  knowledgeBaseIds: string[];
  question: string;
  options?: { includeChildren?: boolean };
};

type ParentView = {
  knowledgeBaseId: string;
  parentId: string;
  pageId: string;
  title: string;
  text: string;
  score: number;
};

type ImageView = {
  knowledgeBaseId: string;
  pageId: string;
  title: string;
  imagePath: string;
  description: string;
  score: number;
};

type ChildView = {
  knowledgeBaseId: string;
  childId: string;
  parentId: string;
  pageId: string;
  text: string;
  score: number;
};

type Signals = {
  hits: number;
  usedParents: number;
  topScore: number | null;
  margin: number | null;
  truncated: boolean;
};

export type RetrieveResponse = {
  requestId: string;
  knowledgeBaseIds: string[];
  searchedKnowledgeBaseIds: string[];
  warnings?: KnowledgeWarning[];
  embeddingModel: string;
  latencyMs: number;
  outcome:
    | {
        kind: "hits";
        parents: ParentView[];
        images: ImageView[];
        children?: ChildView[];
        signals: Signals;
      }
    | {
        kind: "no_hits";
        reason: "no_hits";
        signals: Signals;
      };
};

function invalid(message: string): never {
  throw new ProtocolError(
    400,
    "invalid_request_error",
    "invalid_request",
    message,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function knowledgeBaseIdsFromBody(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalid("knowledgeBaseIds must be a non-empty array.");
  }
  const ids: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim() === "") {
      invalid(`knowledgeBaseIds[${index}] must be a non-empty string.`);
    }
    ids.push(item.trim());
  }
  return [...new Set(ids)];
}

function retrieveBody(value: unknown): RetrieveBody {
  if (!isObject(value)) invalid("Request body must be a JSON object.");
  const knowledgeBaseIds = knowledgeBaseIdsFromBody(value.knowledgeBaseIds);
  const question = value.question;
  if (typeof question !== "string") {
    invalid("question must be a string.");
  }
  const options = value.options;
  if (options !== undefined && !isObject(options)) {
    invalid("options must be an object.");
  }
  const includeChildren = isObject(options)
    ? options.includeChildren
    : undefined;
  if (includeChildren !== undefined && typeof includeChildren !== "boolean") {
    invalid("options.includeChildren must be a boolean.");
  }
  return {
    knowledgeBaseIds,
    question,
    ...(includeChildren === undefined ? {} : { options: { includeChildren } }),
  };
}

export abstract class Retrieve {
  static async retrieve(input: {
    body: unknown;
    requestId: string;
  }): Promise<RetrieveResponse> {
    const body = retrieveBody(input.body);
    const { found, missing } = await KnowledgeBases.getMany(
      body.knowledgeBaseIds,
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

    const start = performance.now();
    let result: Awaited<ReturnType<typeof Retriever.parentsByQuestion>>;
    try {
      const settings = await RetrieverSettings.load();
      result = await Retriever.parentsByQuestion(body.question, {
        ...settings,
        knowledgeBaseIds: found.map((kb) => kb.id),
      });
    } catch {
      throw new ProtocolError(
        500,
        "api_error",
        "internal_error",
        "Retrieval failed.",
      );
    }

    warnings.push(...result.warnings);
    if (result.searchedKnowledgeBaseIds.length === 0) {
      throw new ProtocolError(
        500,
        "api_error",
        "internal_error",
        "All requested knowledge bases failed retrieval.",
      );
    }

    const latencyMs = Math.round(performance.now() - start);
    logRetrievalWarnings({
      requestedKnowledgeBaseIds: body.knowledgeBaseIds,
      warnings,
      embeddingModel: result.currentModel,
      hits: result.hits,
      latencyMs,
    });

    const parents: ParentView[] = result.parents.map((parent) => ({
      knowledgeBaseId: parent.knowledgeBaseId,
      parentId: parent.parentId,
      pageId: parent.pageId,
      title: parent.title,
      text: parent.text,
      score: parent.score,
    }));
    const images: ImageView[] = result.images.map((image) => ({
      knowledgeBaseId: image.knowledgeBaseId,
      pageId: image.pageId,
      title: image.title,
      imagePath: image.imagePath,
      description: image.description,
      score: image.score,
    }));
    const [first, second] = parents;
    const topScore = first?.score ?? null;
    const margin = first && second ? first.score - second.score : null;
    const signals: Signals = {
      hits: result.hits,
      usedParents: parents.length,
      topScore,
      margin,
      truncated: result.truncated,
    };

    const base = {
      requestId: input.requestId,
      knowledgeBaseIds: body.knowledgeBaseIds,
      searchedKnowledgeBaseIds: result.searchedKnowledgeBaseIds,
      ...(warnings.length > 0 ? { warnings } : {}),
      embeddingModel: result.currentModel,
      latencyMs,
    };

    const hasEvidence =
      result.hits > 0 || parents.length > 0 || images.length > 0;
    if (!hasEvidence) {
      return {
        ...base,
        outcome: {
          kind: "no_hits",
          reason: "no_hits",
          signals: {
            hits: 0,
            usedParents: 0,
            topScore: null,
            margin: null,
            truncated: false,
          },
        },
      };
    }

    const children: ChildView[] | undefined = body.options?.includeChildren
      ? result.children.map((child) => ({
          knowledgeBaseId: child.knowledgeBaseId,
          childId: child.childId,
          parentId: child.parentId,
          pageId: child.pageId,
          text: child.childText,
          score: child.score,
        }))
      : undefined;

    return {
      ...base,
      outcome: {
        kind: "hits",
        parents,
        images,
        ...(children ? { children } : {}),
        signals,
      },
    };
  }
}
