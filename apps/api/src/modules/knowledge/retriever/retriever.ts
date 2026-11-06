import type { KnowledgeWarning } from "../../../shared/knowledge.ts";
import { Logger } from "../../log/index.ts";
import {
  resolveTaskModelLink,
  TASK_EMBEDDING,
} from "../../server-setting/task-model-map/service.ts";
import { Embedder, type EmbedFn } from "../embedder/index.ts";
import { DESCRIBED_IMAGE_POLICIES } from "../image-desc/index.ts";
import {
  findParentsByIds,
  scanChildVectors,
  scanImageDescriptionVectors,
} from "./dal.ts";
import {
  type RetrieveOptions,
  resolveRetrieveOptions,
} from "./settings/defaults.ts";

export type ChildHit = {
  knowledgeBaseId: string;
  childId: string;
  parentId: string;
  pageId: string;
  childText: string;
  score: number;
};

export type RetrievedParent = {
  knowledgeBaseId: string;
  parentId: string;
  pageId: string;
  title: string;
  text: string;
  score: number;
};

/** One ranked image-description hit: its caption and page title. */
export type RetrievedImage = {
  knowledgeBaseId: string;
  pageId: string;
  title: string;
  imagePath: string;
  description: string;
  score: number;
};

/** First occurrence of each `parentId` within one knowledge base. */
export function uniqueParentIdsByBestScore(hits: ChildHit[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const hit of hits) {
    if (seen.has(hit.parentId)) continue;
    seen.add(hit.parentId);
    ids.push(hit.parentId);
  }
  return ids;
}

/** First score per parent within one knowledge base. */
export function scoreByParentFromHits(hits: ChildHit[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const hit of hits) {
    if (!scores.has(hit.parentId)) scores.set(hit.parentId, hit.score);
  }
  return scores;
}

/**
 * Keep score order. Stop at `maxParents`. Stop when adding the next parent
 * would exceed `maxCharacters`, except always keep the first parent.
 */
export function capParents(
  parents: RetrievedParent[],
  maxParents: number,
  maxCharacters: number,
): RetrievedParent[] {
  const out: RetrievedParent[] = [];
  let used = 0;
  for (const parent of parents) {
    if (out.length >= maxParents) break;
    const next = used + parent.text.length;
    if (out.length > 0 && next > maxCharacters) break;
    out.push(parent);
    used = next;
  }
  return out;
}

const retrieveLog = Logger.child({ module: "retrieve" }, "retrieve");

export type RetrieveParentsByQuestionOptions = RetrieveOptions & {
  /** The knowledge bases to search. A query requires at least one. */
  knowledgeBaseIds: string[];
  embedder?: EmbedFn;
  /**
   * Owner of the request. Stamped on every `app_log` row this call emits so
   * the user-facing "My logs" page can filter by it.
   */
  userId?: string;
};

export type RetrieveParentsByQuestionResult = {
  currentModel: string;
  parents: RetrievedParent[];
  /** Ranked image-description hits, independent of the parent hits. */
  images: RetrievedImage[];
  /** Child hits before duplicate parents are merged. */
  hits: number;
  /** Raw child hits, best first. */
  children: ChildHit[];
  /** A parent or character cap removed part of the result. */
  truncated: boolean;
  /** Requested knowledge bases that completed retrieval. */
  searchedKnowledgeBaseIds: string[];
  /** Requested knowledge bases that failed retrieval. */
  warnings: KnowledgeWarning[];
};

type KnowledgeBaseResult = {
  knowledgeBaseId: string;
  parents: RetrievedParent[];
  images: RetrievedImage[];
  hits: number;
  children: ChildHit[];
};

function numberFromSql(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parentKey(parent: RetrievedParent): string {
  return `${parent.knowledgeBaseId}\u0000${parent.parentId}`;
}

function imageKey(image: RetrievedImage): string {
  return `${image.knowledgeBaseId}\u0000${image.pageId}\u0000${image.imagePath}`;
}

function childKey(child: ChildHit): string {
  return `${child.knowledgeBaseId}\u0000${child.childId}`;
}

/** Retrieve one KB with an already-computed query vector. */
async function retrieveOneKnowledgeBase(input: {
  knowledgeBaseId: string;
  currentModel: string;
  embeddingLiteral: string;
  childLimit: number;
}): Promise<KnowledgeBaseResult> {
  const [childRows, imageRows] = await Promise.all([
    scanChildVectors({
      knowledgeBaseIds: [input.knowledgeBaseId],
      currentModel: input.currentModel,
      embeddingLiteral: input.embeddingLiteral,
      limit: input.childLimit,
    }),
    scanImageDescriptionVectors({
      knowledgeBaseIds: [input.knowledgeBaseId],
      currentModel: input.currentModel,
      embeddingLiteral: input.embeddingLiteral,
      policies: [...DESCRIBED_IMAGE_POLICIES],
    }),
  ]);

  const images: RetrievedImage[] = imageRows.map((row) => ({
    knowledgeBaseId: row.knowledge_base_id,
    pageId: row.page_id,
    title: row.title ?? "",
    imagePath: row.image_path,
    description: row.description ?? "",
    score: numberFromSql(row.score),
  }));

  const hits: ChildHit[] = childRows.map((row) => ({
    knowledgeBaseId: row.knowledge_base_id,
    childId: row.child_id,
    parentId: row.parent_id,
    pageId: row.page_id,
    childText: row.child_text ?? "",
    score: numberFromSql(row.score),
  }));

  if (hits.length === 0) {
    return {
      knowledgeBaseId: input.knowledgeBaseId,
      parents: [],
      images,
      hits: 0,
      children: [],
    };
  }

  const parentIds = uniqueParentIdsByBestScore(hits);
  const scores = scoreByParentFromHits(hits);
  const parentRows = await findParentsByIds(
    parentIds.map((parentId) => ({
      knowledgeBaseId: input.knowledgeBaseId,
      parentId,
    })),
  );

  const byId = new Map(
    parentRows.map((row) => [
      row.id,
      {
        knowledgeBaseId: row.knowledge_base_id,
        parentId: row.id,
        pageId: row.page_id,
        title: row.title ?? "",
        text: row.text ?? "",
        score: scores.get(row.id) ?? 0,
      } satisfies RetrievedParent,
    ]),
  );

  const parents: RetrievedParent[] = [];
  for (const id of parentIds) {
    const parent = byId.get(id);
    if (parent) parents.push(parent);
  }

  return {
    knowledgeBaseId: input.knowledgeBaseId,
    parents,
    images,
    hits: hits.length,
    children: hits,
  };
}

export abstract class Retriever {
  /**
   * Embed the question once and retrieve from every requested knowledge base.
   * Successful bases are merged; failed bases are returned as warnings.
   *
   * @see docs/modern-knowledge-base-design/04-retrieval.md
   */
  static async parentsByQuestion(
    question: string,
    options: RetrieveParentsByQuestionOptions,
  ): Promise<RetrieveParentsByQuestionResult> {
    const trimmed = question.trim();
    const knowledgeBaseIds = [
      ...new Set(
        options.knowledgeBaseIds
          .map((id) => id.trim())
          .filter((id) => id !== ""),
      ),
    ];
    if (knowledgeBaseIds.length === 0) {
      throw new Error("At least one knowledge base is required");
    }

    const knobs = resolveRetrieveOptions(options);
    const link = await resolveTaskModelLink(TASK_EMBEDDING);
    if (!link) {
      throw new Error("No model is linked to the embedding task");
    }
    const currentModel = link.model.identifier;
    const start = performance.now();

    if (trimmed === "") {
      retrieveLog.info("retrieve skipped", {
        userId: options.userId,
        status: "empty_question",
        knowledgeBaseIds,
        embeddingModel: currentModel,
        childLimit: knobs.childLimit,
        latencyMs: 0,
      });
      return {
        currentModel,
        parents: [],
        images: [],
        hits: 0,
        children: [],
        truncated: false,
        searchedKnowledgeBaseIds: knowledgeBaseIds,
        warnings: [],
      };
    }

    try {
      const embedder =
        options.embedder ??
        ((texts: string[]) => link.provider.embed(link.model.modelId, texts));
      const vectors = await embedder([trimmed]);
      const vector = vectors[0];
      if (!vector) {
        throw new Error("Question embed returned no vector");
      }
      const embeddingLiteral = Embedder.pgvectorLiteral(vector);

      const settled = await Promise.allSettled(
        knowledgeBaseIds.map((knowledgeBaseId) =>
          retrieveOneKnowledgeBase({
            knowledgeBaseId,
            currentModel,
            embeddingLiteral,
            childLimit: knobs.childLimit,
          }),
        ),
      );

      const successes: KnowledgeBaseResult[] = [];
      const warnings: KnowledgeWarning[] = [];
      for (const [index, result] of settled.entries()) {
        const knowledgeBaseId = knowledgeBaseIds[index];
        if (!knowledgeBaseId) continue;
        if (result.status === "fulfilled") {
          successes.push(result.value);
        } else {
          warnings.push({
            code: "retrieval_failed",
            knowledgeBaseId,
            message:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      }

      const searchedKnowledgeBaseIds = successes.map(
        (result) => result.knowledgeBaseId,
      );

      const parents = successes
        .flatMap((result) => result.parents)
        .sort(
          (a, b) =>
            b.score - a.score || parentKey(a).localeCompare(parentKey(b)),
        );
      const images = successes
        .flatMap((result) => result.images)
        .sort(
          (a, b) => b.score - a.score || imageKey(a).localeCompare(imageKey(b)),
        )
        .slice(0, 3);
      const children = successes
        .flatMap((result) => result.children)
        .sort(
          (a, b) => b.score - a.score || childKey(a).localeCompare(childKey(b)),
        );
      const hits = successes.reduce((total, result) => total + result.hits, 0);
      const capped = capParents(parents, knobs.maxParents, knobs.maxCharacters);
      const allFailed = successes.length === 0;

      if (allFailed) {
        retrieveLog.error("retrieve all_failed", {
          userId: options.userId,
          status: "error",
          question: trimmed,
          knowledgeBaseIds,
          embeddingModel: currentModel,
          childLimit: knobs.childLimit,
          warnings,
          latencyMs: Math.round(performance.now() - start),
        });
      } else {
        retrieveLog.info(
          warnings.length > 0
            ? "retrieve partial"
            : children.length === 0
              ? "retrieve no_hits"
              : "retrieve ok",
          {
            userId: options.userId,
            status:
              warnings.length > 0
                ? "partial"
                : children.length === 0
                  ? "no_hits"
                  : "ok",
            question: trimmed,
            knowledgeBaseIds,
            searchedKnowledgeBaseIds,
            embeddingModel: currentModel,
            childLimit: knobs.childLimit,
            hits,
            warnings,
            topK: children,
            images,
            latencyMs: Math.round(performance.now() - start),
          },
        );
      }

      return {
        currentModel,
        parents: capped,
        images,
        hits,
        children,
        truncated: capped.length < parents.length,
        searchedKnowledgeBaseIds,
        warnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      retrieveLog.error("retrieve error", {
        userId: options.userId,
        status: "error",
        question: trimmed,
        knowledgeBaseIds,
        embeddingModel: currentModel,
        childLimit: knobs.childLimit,
        error: message,
        latencyMs: Math.round(performance.now() - start),
      });
      throw err;
    }
  }
}
