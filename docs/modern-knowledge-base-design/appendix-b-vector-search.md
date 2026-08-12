# Appendix B — Vector search (question → parents)

After children are embedded ([chunkify.md](./chunkify.md), [appendix-a-data-model.md](./appendix-a-data-model.md)), answer retrieval uses **pgvector in SQL** on `kb_children.embedding`. Prisma Client is not used for similarity.

## End-to-end flow

```text
1. Embed the user question with the same model and dimensions as children
2. Similarity-search child rows (vector index)
3. Resolve each hit’s parent (and page title / slug)
4. Dedupe / merge overlapping parents
5. Apply a character / parent budget
6. Send parent texts to the LLM (not child snippets alone)
```

Optional: hybrid rank later (keyword FTS on page/child text + vector RRF). v1 can be vector-only.

## Embed the question

- Same provider and model string stored on `children.embedding_model`
- Same dimension as `vector(N)`
- Optional same title-style prefix policy as ingest if you used one at embed time; keep query and document sides consistent

## Similarity SQL (cosine)

Cosine **distance** operator: `<=>` (lower is closer). Score for display can be `1 - distance`.

```sql
SELECT
  c.id AS child_id,
  c.parent_id,
  c.page_id,
  c.text AS child_text,
  1 - (c.embedding <=> $1::vector) AS score
FROM kb_children c
WHERE c.embedding IS NOT NULL
ORDER BY c.embedding <=> $1::vector
LIMIT $2;
```

Bind `$1` as a pgvector literal built from the question embedding (for example `'[0.12,0.03,…]'`). Prefer an HNSW index with `vector_cosine_ops` when using cosine.

| Operator | Use                                           |
| -------- | --------------------------------------------- |
| `<=>`    | Cosine distance (typical for text embeddings) |
| `<->`    | L2 distance                                   |
| `<#>`    | Inner product (mind sign conventions)         |

Run this via `postgres.js` or `prisma.$queryRaw` — not `prisma.knowledgeChild.findMany`.

## Expand to parents

```sql
SELECT p.id, p.text, pg.slug, pg.title
FROM kb_parents p
JOIN kb_pages pg ON pg.id = p.page_id
WHERE p.id = ANY($1::text[]);
```

Then:

1. Preserve best child score per parent (or max score among that parent’s hit children).
2. Drop duplicate parents.
3. Cap by max parents and max total characters (same role as today’s hydrate budgets).
4. Build the synthesis prompt from **parent** text + page title/slug.

Never send only the tiny child window as the sole LLM context when a parent exists.

## Stale vectors

If `embedding` is null or `embedding_model` does not match the configured model, exclude from search (or repair first via the re-embed API in [chunkify.md](./chunkify.md)).
