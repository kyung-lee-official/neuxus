# Appendix B — Vector search (question → parents)

Similarity on `kb_children.embedding` via **pgvector SQL** (not Prisma Client). Schema/index: [appendix-a-data-model.md](./appendix-a-data-model.md). Chunk roles: [01-chunkify.md](./01-chunkify.md).

## Flow

```text
1. Embed the question (same model / dims as children)
2. Similarity-search children
3. Resolve parents (+ page title / slug)
4. Dedupe parents; keep best child score per parent
5. Cap by max parents / max characters
6. LLM gets parent texts (+ title / slug) — not child windows alone
```

v1: vector-only. Optional later: hybrid FTS + RRF.

## Question embed

Same provider/model as `children.embedding_model` and `vector(N)`. If ingest prefixes child text (e.g. `Title: …`), use the same policy on the query side.

## Similarity SQL (cosine)

`<=>` = cosine distance (lower is closer). Display score: `1 - distance`. Prefer HNSW with `vector_cosine_ops` ([appendix-a](./appendix-a-data-model.md)).

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

| Operator | Use                        |
| -------- | -------------------------- |
| `<=>`    | Cosine distance            |
| `<->`    | L2                         |
| `<#>`    | Inner product (watch sign) |

## Expand to parents

```sql
SELECT p.id, p.text, pg.slug, pg.title
FROM kb_parents p
JOIN kb_pages pg ON pg.id = p.page_id
WHERE p.id = ANY($1::text[]);
```

## Stale vectors

Null `embedding` or mismatched `embedding_model` → exclude from search (or repair via re-embed; [01-chunkify incremental updates](./01-chunkify.md#incremental-updates-page-hash)).
