/**
 * Evidence-only retrieval endpoint: same retrieval as `/v1/messages`, but no
 * model call and no enrichment.
 */

import { ProtocolError } from "../../shared/protocol.ts";
import { KnowledgeBases } from "../knowledge/knowledge-bases/index.ts";
import { Retriever, RetrieverSettings } from "../knowledge/retriever/index.ts";

type RetrieveBody = {
  knowledgeBaseId: string;
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
  knowledgeBaseId: string;
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

function retrieveBody(value: unknown): RetrieveBody {
  if (!isObject(value)) invalid("Request body must be a JSON object.");
  const knowledgeBaseId = value.knowledgeBaseId;
  if (typeof knowledgeBaseId !== "string" || knowledgeBaseId.trim() === "") {
    invalid("knowledgeBaseId must be a non-empty string.");
  }
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
    knowledgeBaseId: knowledgeBaseId.trim(),
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
    const knowledgeBase = await KnowledgeBases.get(body.knowledgeBaseId);
    if (!knowledgeBase) {
      throw new ProtocolError(
        404,
        "not_found_error",
        "knowledge_base_not_found",
        `No knowledge base with id '${body.knowledgeBaseId}'.`,
      );
    }

    const start = performance.now();
    let result: Awaited<ReturnType<typeof Retriever.parentsByQuestion>>;
    try {
      const settings = await RetrieverSettings.load();
      result = await Retriever.parentsByQuestion(body.question, {
        ...settings,
        knowledgeBaseId: body.knowledgeBaseId,
      });
    } catch {
      throw new ProtocolError(
        500,
        "api_error",
        "internal_error",
        "Retrieval failed.",
      );
    }

    const parents: ParentView[] = result.parents.map((parent) => ({
      knowledgeBaseId: body.knowledgeBaseId,
      parentId: parent.parentId,
      pageId: parent.pageId,
      title: parent.title,
      text: parent.text,
      score: parent.score,
    }));
    const images: ImageView[] = result.images.map((image) => ({
      knowledgeBaseId: body.knowledgeBaseId,
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
      knowledgeBaseId: body.knowledgeBaseId,
      embeddingModel: result.currentModel,
      latencyMs: Math.round(performance.now() - start),
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
