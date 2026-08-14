import { db } from "../db.ts";
import { createEmbedder } from "./provider.ts";
import { loadEmbedSettings } from "./settings.ts";
import type { Embedder } from "./types.ts";

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
        skipped += 1;
        continue;
      }
      await args.writeVector(row.id, vector);
      embedded += 1;
    } catch {
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
  const settings = await loadEmbedSettings();
  const embedder = options?.embedder ?? createEmbedder(settings);
  const sql = db();
  const currentModel = settings.embeddingModel;

  const rows = options?.pageId
    ? await sql`
        SELECT id, text
        FROM kb_children
        WHERE page_id = ${options.pageId}
          AND (
            embedding IS NULL
            OR embedding_model IS DISTINCT FROM ${currentModel}
          )
      `
    : await sql`
        SELECT id, text
        FROM kb_children
        WHERE
          embedding IS NULL
          OR embedding_model IS DISTINCT FROM ${currentModel}
      `;

  const children: EmbedChildRow[] = rows.map((row) => ({
    id: String(row.id),
    text: String(row.text ?? ""),
  }));

  const result = await embedChildRows(children, {
    embedder,
    writeVector: async (id, vector) => {
      const literal = pgvectorLiteral(vector);
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
