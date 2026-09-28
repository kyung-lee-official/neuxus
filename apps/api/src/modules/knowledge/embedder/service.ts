/**
 * Embedder service. Owns the `kb_children` embedding pass: find children
 * whose `embedding_model` is missing or stale, embed their text via the model
 * linked to the `embedding` task, and write the pgvector back.
 */

import {
  resolveTaskModelLink,
  TASK_EMBEDDING,
} from "../../server-setting/task-model-map/service.ts";
import { findChildrenNeedingEmbedding, writeChildEmbedding } from "./dal.ts";

/** Embed texts: one vector per text, in order. */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export type EmbedChildRow = {
  knowledgeBaseId: string;
  id: string;
  text: string;
};

export type EmbedChildRowsResult = {
  embedded: number;
  skipped: number;
};

export type EmbedStaleChildrenOptions = {
  /** Scope to one knowledge base (optionally to one page within it). */
  knowledgeBaseId?: string;
  pageId?: string;
  embedder?: EmbedFn;
  /** Throw on the first provider failure instead of skipping the child. */
  failFast?: boolean;
};

export type EmbedStaleChildrenResult = EmbedChildRowsResult & {
  currentModel: string;
  considered: number;
};

export abstract class Embedder {
  /** Format a vector as a pgvector literal. */
  static pgvectorLiteral(values: number[]): string {
    if (values.length === 0 || values.some((n) => !Number.isFinite(n))) {
      throw new Error("invalid embedding vector");
    }
    return `[${values.join(",")}]`;
  }

  /**
   * Embed each row; skip empty text or a failed provider call (leave DB unchanged).
   * @see docs/model-management/README.md
   */
  static async embedChildRows(
    rows: EmbedChildRow[],
    args: {
      embedder: EmbedFn;
      writeVector: (row: EmbedChildRow, vector: number[]) => Promise<void>;
      failFast?: boolean;
    },
  ): Promise<EmbedChildRowsResult> {
    let embedded = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.text === "") {
        skipped += 1;
        continue;
      }
      try {
        const vectors = await args.embedder([row.text]);
        const vector = vectors[0];
        if (!vector) {
          if (args.failFast) {
            throw new Error("embedder returned no vector");
          }
          skipped += 1;
          continue;
        }
        await args.writeVector(row, vector);
        embedded += 1;
      } catch (err) {
        if (args.failFast) throw err;
        skipped += 1;
      }
    }

    return { embedded, skipped };
  }

  /**
   * Embed children with null or stale `embedding_model`.
   * Scope with `knowledgeBaseId` / `pageId`; omit to scan all knowledge bases.
   */
  static async embedStaleChildren(
    options?: EmbedStaleChildrenOptions,
  ): Promise<EmbedStaleChildrenResult> {
    const link = await resolveTaskModelLink(TASK_EMBEDDING);
    if (!link) {
      throw new Error("No model is linked to the embedding task");
    }
    const currentModel = link.model.identifier;
    const embedder =
      options?.embedder ??
      ((texts: string[]) => link.provider.embed(link.model.modelId, texts));

    const children = await findChildrenNeedingEmbedding(currentModel, {
      knowledgeBaseId: options?.knowledgeBaseId,
      pageId: options?.pageId,
    });

    const result = await Embedder.embedChildRows(children, {
      embedder,
      failFast: options?.failFast,
      writeVector: async (row, vector) => {
        await writeChildEmbedding(
          row.knowledgeBaseId,
          row.id,
          Embedder.pgvectorLiteral(vector),
          currentModel,
        );
      },
    });

    return {
      currentModel,
      considered: children.length,
      embedded: result.embedded,
      skipped: result.skipped,
    };
  }
}
