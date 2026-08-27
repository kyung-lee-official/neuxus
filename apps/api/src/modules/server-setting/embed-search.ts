import { sql } from "bun";
import {
  createEmbedder,
  type Embedder,
  loadEmbedSettings,
  pgvectorLiteral,
} from "../../shared/embed/index.ts";
import type { KnowledgePageListItem } from "../../shared/knowledge/list.ts";
import { tagsFromRow } from "../../shared/knowledge/row.ts";
import { isoFromDate } from "../../shared/serialize.ts";

export type EmbedTestSearchHit = KnowledgePageListItem & {
  /** Cosine similarity in [0, 1]; 1 - distance. */
  score: number;
};

export type EmbedTestSearchResult = {
  results: EmbedTestSearchHit[];
};

type TestSearchRow = {
  id: string;
  slug: string;
  title: string | null;
  type: string | null;
  tags: string[];
  source_path: string | null;
  content_hash: string | null;
  updated_at: Date | null;
  parent_count: number;
  child_count: number;
  score: number | string;
};

function numberFromSql(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export const EMBED_TEST_SEARCH_DEFAULT_LIMIT = 10;
export const EMBED_TEST_SEARCH_MAX_LIMIT = 50;

export type SqlRunner = (
  template: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export type RunTestEmbedSearchOptions = {
  /** Inject a custom embedder (used by tests). Defaults to the configured one. */
  embedder?: Embedder;
  /** Override the embedding model name used in the WHERE clause. */
  embeddingModel?: string;
  /** Inject a SQL runner (used by tests). Defaults to Bun's `sql`. */
  runSql?: SqlRunner;
};

/**
 * Embed `query` via the configured embedder, cosine-search `kb_children`,
 * aggregate the top child score per `page_id`, and return the highest-scoring
 * `kb_pages` (with metadata + child/parent counts).
 */
export async function runTestEmbedSearch(
  query: string,
  limit: number = EMBED_TEST_SEARCH_DEFAULT_LIMIT,
  options?: RunTestEmbedSearchOptions,
): Promise<EmbedTestSearchResult> {
  const trimmed = query.trim();
  if (trimmed === "") {
    return { results: [] };
  }
  const clampedLimit = Math.max(
    1,
    Math.min(EMBED_TEST_SEARCH_MAX_LIMIT, Math.floor(limit)),
  );

  const embedder =
    options?.embedder ?? createEmbedder(await loadEmbedSettings());
  const vectors = await embedder.embed([trimmed]);
  const vector = vectors[0];
  if (!vector) {
    throw new Error("Question embed returned no vector");
  }
  const literal = pgvectorLiteral(vector);
  const currentModel =
    options?.embeddingModel ?? (await loadEmbedSettings()).embeddingModel;
  const runSql: SqlRunner = options?.runSql ?? (sql as SqlRunner);

  const rows = (await runSql`
    WITH best AS (
      SELECT page_id, MAX(1 - (embedding <=> ${literal}::vector)) AS score
      FROM kb_children
      WHERE embedding IS NOT NULL
        AND embedding_model IS NOT DISTINCT FROM ${currentModel}
      GROUP BY page_id
      ORDER BY score DESC
      LIMIT ${clampedLimit}
    )
    SELECT
      p.id,
      p.slug,
      p.title,
      p.type,
      p.tags,
      p.source_path,
      p.content_hash,
      p.updated_at,
      (
        SELECT COUNT(*)::int FROM kb_parents WHERE page_id = p.id
      ) AS parent_count,
      (
        SELECT COUNT(*)::int FROM kb_children WHERE page_id = p.id
      ) AS child_count,
      best.score
    FROM kb_pages p
    JOIN best ON best.page_id = p.id
    ORDER BY best.score DESC
  `) as TestSearchRow[];

  return {
    results: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title ?? "",
      type: row.type,
      tags: tagsFromRow(row.tags),
      sourcePath: row.source_path,
      contentHash: row.content_hash ?? "",
      updatedAt: isoFromDate(row.updated_at),
      parentCount: row.parent_count,
      childCount: row.child_count,
      score: numberFromSql(row.score),
    })),
  };
}
