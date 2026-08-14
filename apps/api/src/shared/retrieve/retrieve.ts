import { db } from "../db.ts";
import {
  createEmbedder,
  type Embedder,
  loadEmbedSettings,
  pgvectorLiteral,
} from "../embed/index.ts";
import { type RetrieveOptions, resolveRetrieveOptions } from "./defaults.ts";
import {
  type ChildHit,
  capParents,
  type RetrievedParent,
  scoreByParentFromHits,
  uniqueParentIdsByBestScore,
} from "./rank.ts";

export type RetrieveParentsByQuestionOptions = RetrieveOptions & {
  embedder?: Embedder;
};

export type RetrieveParentsByQuestionResult = {
  currentModel: string;
  parents: RetrievedParent[];
};

function numberFromSql(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Embed the question and return ranked unique parents for the LLM.
 * Empty question → no parents. Does not call the synthesizer.
 * @see docs/modern-knowledge-base-design/05-query.md
 */
export async function retrieveParentsByQuestion(
  question: string,
  options?: RetrieveParentsByQuestionOptions,
): Promise<RetrieveParentsByQuestionResult> {
  const trimmed = question.trim();
  const knobs = resolveRetrieveOptions(options);
  const settings = await loadEmbedSettings();
  const currentModel = settings.embeddingModel;

  if (trimmed === "") {
    return { currentModel, parents: [] };
  }

  const embedder = options?.embedder ?? createEmbedder(settings);
  const vectors = await embedder.embed([trimmed]);
  const vector = vectors[0];
  if (!vector) {
    throw new Error("Question embed returned no vector");
  }

  const literal = pgvectorLiteral(vector);
  const sql = db();
  const childRows = await sql`
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

  const hits: ChildHit[] = childRows.map((row) => ({
    childId: String(row.child_id),
    parentId: String(row.parent_id),
    pageId: String(row.page_id),
    childText: String(row.child_text ?? ""),
    score: numberFromSql(row.score),
  }));

  const parentIds = uniqueParentIdsByBestScore(hits);
  if (parentIds.length === 0) {
    return { currentModel, parents: [] };
  }

  const scores = scoreByParentFromHits(hits);
  const parentRows = await sql`
    SELECT p.id, p.page_id, p.text, pg.slug, pg.title
    FROM kb_parents p
    JOIN kb_pages pg ON pg.id = p.page_id
    WHERE p.id = ANY(${sql.array(parentIds)}::text[])
  `;

  const byId = new Map(
    parentRows.map((row) => [
      String(row.id),
      {
        parentId: String(row.id),
        pageId: String(row.page_id),
        slug: String(row.slug),
        title: String(row.title),
        text: String(row.text ?? ""),
        score: scores.get(String(row.id)) ?? 0,
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
}
