import { sql } from "bun";
import { getPrisma } from "../db.ts";
import { getEmbedder, getEmbedModelId } from "../models/routing.ts";
import type { Embedder } from "../models/types.ts";

export type EmbedChildRow = {
  id: string;
  text: string;
};

export type EmbedChildRowsResult = {
  embedded: number;
  skipped: number;
};

export type EmbedStaleChildrenOptions = {
  pageId?: string;
  embedder?: Embedder;
  /** Throw on the first provider failure instead of skipping the child. */
  failFast?: boolean;
};

export type EmbedStaleChildrenResult = EmbedChildRowsResult & {
  currentModel: string;
  considered: number;
};

export function pgvectorLiteral(values: number[]): string {
  if (values.length === 0 || values.some((n) => !Number.isFinite(n))) {
    throw new Error("invalid embedding vector");
  }
  return `[${values.join(",")}]`;
}

/**
 * Embed each row; skip empty text or a failed provider call (leave DB unchanged).
 * @see docs/modern-knowledge-base-design/04-embed.md
 */
export async function embedChildRows(
  rows: EmbedChildRow[],
  args: {
    embedder: Embedder;
    writeVector: (id: string, vector: number[]) => Promise<void>;
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
      const vectors = await args.embedder.embed([row.text]);
      const vector = vectors[0];
      if (!vector) {
        if (args.failFast) {
          throw new Error("embedder returned no vector");
        }
        skipped += 1;
        continue;
      }
      await args.writeVector(row.id, vector);
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
 * Scope with `pageId` after a page replace; omit to scan all pages.
 */
export async function embedStaleChildren(
  options?: EmbedStaleChildrenOptions,
): Promise<EmbedStaleChildrenResult> {
  const embedder = options?.embedder ?? (await getEmbedder());
  const currentModel = await getEmbedModelId();

  const rows = await getPrisma().knowledgeChild.findMany({
    where: {
      ...(options?.pageId ? { pageId: options.pageId } : {}),
      // `embedding IS NULL` ⇒ `embeddingModel IS NULL` (always set together);
      // otherwise pick up stale rows whose model differs.
      OR: [{ embeddingModel: null }, { embeddingModel: { not: currentModel } }],
    },
    select: { id: true, text: true },
  });

  const children: EmbedChildRow[] = rows.map((row) => ({
    id: row.id,
    text: row.text ?? "",
  }));

  const result = await embedChildRows(children, {
    embedder,
    failFast: options?.failFast,
    writeVector: async (id, vector) => {
      const literal = pgvectorLiteral(vector);
      // Vector write stays raw — `kb_children.embedding` is pgvector.
      await sql`
        UPDATE kb_children
        SET
          embedding = ${literal}::vector,
          embedding_model = ${currentModel},
          embedded_at = NOW()
        WHERE id = ${id}
      `;
    },
  });

  return {
    currentModel,
    considered: children.length,
    embedded: result.embedded,
    skipped: result.skipped,
  };
}
