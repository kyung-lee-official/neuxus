import { sql } from "bun";
import { childLogger } from "../../log/index.ts";
import {
  resolveTaskModelLink,
  TASK_EMBEDDING,
} from "../../server-setting/task-model-map/service.ts";
import { Embedder, type EmbedFn } from "../embedder/index.ts";
import {
  type RetrieveOptions,
  resolveRetrieveOptions,
} from "./settings/defaults.ts";

export type ChildHit = {
  childId: string;
  parentId: string;
  pageId: string;
  childText: string;
  score: number;
};

export type RetrievedParent = {
  parentId: string;
  pageId: string;
  slug: string;
  title: string;
  text: string;
  score: number;
};

/** First occurrence of each `parentId` (hits must already be best-first). */
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

const retrieveLog = childLogger({ module: "retrieve" }, "retrieve");

/** One row of the raw top-K result from the vector scan. */
type TopKHit = {
  childId: string;
  parentId: string;
  pageId: string;
  score: number;
  /** Full child text. The log is the source of truth, so we keep the whole row. */
  text: string;
};

export type RetrieveParentsByQuestionOptions = RetrieveOptions & {
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
};

type ChildHitRow = {
  child_id: string;
  parent_id: string;
  page_id: string;
  child_text: string | null;
  score: number | string;
};

type ParentRow = {
  id: string;
  page_id: string;
  text: string | null;
  slug: string;
  title: string | null;
};

function numberFromSql(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export abstract class Retriever {
  /**
   * Embed the question and return ranked unique parents for the LLM.
   * Empty question → no parents. Does not call the synthesizer.
   *
   * Logs:
   *  - `retrieve skipped` (status: "empty_question") when question is blank
   *  - `retrieve ok`       (status: "ok" | "no_hits") after the vector scan,
   *                          with the raw top-K child hits + scores
   *  - `retrieve error`    (status: "error") on any throw; rethrown after logging
   *
   * @see docs/modern-knowledge-base-design/05-query.md
   */
  static async parentsByQuestion(
    question: string,
    options?: RetrieveParentsByQuestionOptions,
  ): Promise<RetrieveParentsByQuestionResult> {
    const trimmed = question.trim();
    const knobs = resolveRetrieveOptions(options);
    const link = await resolveTaskModelLink(TASK_EMBEDDING);
    if (!link) {
      throw new Error("No model is linked to the embedding task");
    }
    const currentModel = link.model.identifier;
    const start = performance.now();

    if (trimmed === "") {
      retrieveLog.info("retrieve skipped", {
        userId: options?.userId,
        status: "empty_question",
        embeddingModel: currentModel,
        childLimit: knobs.childLimit,
        latencyMs: 0,
      });
      return { currentModel, parents: [] };
    }

    try {
      const embedder =
        options?.embedder ??
        ((texts: string[]) => link.provider.embed(link.model.modelId, texts));
      const vectors = await embedder([trimmed]);
      const vector = vectors[0];
      if (!vector) {
        throw new Error("Question embed returned no vector");
      }

      const literal = Embedder.pgvectorLiteral(vector);
      const childRows = await sql<ChildHitRow[]>`
        SELECT
          c.id AS child_id,
          c.parent_id,
          c.page_id,
          c.text AS child_text,
          1 - (c.embedding <=> ${literal}::vector) AS score
        FROM kb_children c
        WHERE c.embedding IS NOT NULL
          AND c.embedding_model IS NOT DISTINCT FROM ${currentModel}
        ORDER BY c.embedding <=> ${literal}::vector
        LIMIT ${knobs.childLimit}
      `;

      const topK: TopKHit[] = childRows.map((row) => ({
        childId: row.child_id,
        parentId: row.parent_id,
        pageId: row.page_id,
        score: numberFromSql(row.score),
        text: row.child_text ?? "",
      }));

      retrieveLog.info(topK.length === 0 ? "retrieve no_hits" : "retrieve ok", {
        userId: options?.userId,
        status: topK.length === 0 ? "no_hits" : "ok",
        question: trimmed,
        embeddingModel: currentModel,
        childLimit: knobs.childLimit,
        topK,
        latencyMs: Math.round(performance.now() - start),
      });

      if (topK.length === 0) {
        return { currentModel, parents: [] };
      }

      const hits: ChildHit[] = childRows.map((row) => ({
        childId: row.child_id,
        parentId: row.parent_id,
        pageId: row.page_id,
        childText: row.child_text ?? "",
        score: numberFromSql(row.score),
      }));

      const parentIds = uniqueParentIdsByBestScore(hits);
      if (parentIds.length === 0) {
        return { currentModel, parents: [] };
      }

      const scores = scoreByParentFromHits(hits);
      const parentRows = await sql<ParentRow[]>`
        SELECT p.id, p.page_id, p.text, pg.slug, pg.title
        FROM kb_parents p
        JOIN kb_pages pg ON pg.id = p.page_id
        WHERE p.id = ANY(${sql.array(parentIds, "text[]")})
      `;

      const byId = new Map(
        parentRows.map((row) => [
          row.id,
          {
            parentId: row.id,
            pageId: row.page_id,
            slug: row.slug,
            title: row.title ?? "",
            text: row.text ?? "",
            score: scores.get(row.id) ?? 0,
          } satisfies RetrievedParent,
        ]),
      );

      const ordered: RetrievedParent[] = [];
      for (const id of parentIds) {
        const parent = byId.get(id);
        if (parent) ordered.push(parent);
      }

      return {
        currentModel,
        parents: capParents(ordered, knobs.maxParents, knobs.maxCharacters),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      retrieveLog.error("retrieve error", {
        userId: options?.userId,
        status: "error",
        question: trimmed,
        embeddingModel: currentModel,
        childLimit: knobs.childLimit,
        error: message,
        latencyMs: Math.round(performance.now() - start),
      });
      throw err;
    }
  }
}
