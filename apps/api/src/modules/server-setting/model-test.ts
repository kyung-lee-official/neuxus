/**
 * Per-task test handlers for the model registry.
 *
 * `runTestEmbeddingSearch` exercises the configured embedder with a
 * cosine search over `kb_children`. `runTestChat` and `runTestVision`
 * invoke the chat and vision clients with a one-shot prompt/image.
 *
 * Each function is the production-callable test for one capability.
 * The HTTP layer (`/server-setting/model/test/:task`) dispatches to
 * one of them.
 */

import { sql } from "bun";
import { pgvectorLiteral } from "../../shared/embed/index.ts";
import type { KnowledgePageListItem } from "../../shared/knowledge/list.ts";
import { tagsFromRow } from "../../shared/knowledge/row.ts";
import { createEmbedClient } from "../../shared/models/clients/embed.ts";
import {
  getEmbedder,
  getEmbedModelId,
  getImageDescriber,
  getSynthesizer,
  loadModelConfig,
  resolveModelByModelId,
} from "../../shared/models/index.ts";
import type { Embedder } from "../../shared/models/types.ts";
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
export async function runTestEmbeddingSearch(
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

  const embedder = options?.embedder ?? (await getEmbedder());
  const vectors = await embedder.embed([trimmed]);
  const vector = vectors[0];
  if (!vector) {
    throw new Error("Question embed returned no vector");
  }
  const literal = pgvectorLiteral(vector);
  const currentModel = options?.embeddingModel ?? (await getEmbedModelId());
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

/**
 * Run a one-shot chat call against the configured LLM. Echoes the
 * model id / provider id alongside the response so the test panel can
 * show which model produced it.
 */
export async function runTestChat(prompt: string): Promise<{
  response: string;
  prompt: string;
}> {
  const synthesizer = await getSynthesizer();
  const response = await synthesizer.synthesize(prompt);
  return { response, prompt };
}

/**
 * Run a one-shot vision call against the configured vision model.
 * `imageBase64` is the raw base64 (no `data:` prefix); `mimeType` and
 * `name` are echoed in the response for the test panel UI.
 */
export async function runTestVision(input: {
  imageBase64: string;
  mimeType: string;
  name: string;
}): Promise<{
  description: string;
  mimeType: string;
  sizeBytes: number;
  name: string;
}> {
  const describer = await getImageDescriber();
  const bytes = Buffer.from(input.imageBase64, "base64");
  const description = await describer.describe({
    absolutePath: input.name,
    bytes,
    mimeType: input.mimeType || "application/octet-stream",
  });
  return {
    description: description.replace(/\s+/g, " ").trim(),
    mimeType: input.mimeType,
    sizeBytes: bytes.length,
    name: input.name,
  };
}

export type RunTestEmbedResult = {
  embedding: number[];
  modelId: string;
  dim: number;
  inputText: string;
};

export type RunTestEmbedOptions = {
  /** Catalog model id to embed with (must declare the `embedding` capability). */
  modelId: string;
};

/**
 * Run the chosen model's embedder on a single string and return the raw
 * vector (no cosine search). Used by the per-model "Test embed" button
 * on the providers page. Resolution goes through
 * `resolveModelByModelId`, so it tests exactly the clicked model over
 * its provider's saved connection — no embedding-task assignment is
 * required.
 */
export async function runTestEmbed(
  text: string,
  options: RunTestEmbedOptions,
): Promise<RunTestEmbedResult> {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new Error("text is required");
  }
  const config = await loadModelConfig();
  const resolved = resolveModelByModelId(options.modelId, "embedding", config);
  const vectors = await createEmbedClient(resolved).embed([trimmed]);
  const embedding = vectors[0];
  if (!embedding) {
    throw new Error("Embedder returned no vector");
  }
  return {
    embedding,
    modelId: resolved.model.id,
    dim: embedding.length,
    inputText: trimmed,
  };
}
