# Query (question → parents)

Embed the question, similarity-search `kb_children.embedding`, expand to parents for the LLM.

## Flow

```text
1. Embed the question (same model / dims as children)
2. Similarity-search children
3. Resolve parents (+ page title)
4. Dedupe parents; keep best child score per parent
5. Cap by max parents / max characters
6. LLM gets parent texts (+ title) — not child windows alone ([05-synthesis.md](./05-synthesis.md))
```

Separately, the same embedded question drives a second similarity search over `kb_image_descriptions.embedding` ([Image-description search](#image-description-search)).

## Question embed

Resolve the **`embedding`** task link (catalog model + provider connection) and embed the question with that model/client and `vector(N)`. It must match the model the children were embedded with ([model-management](../model-management/README.md)).

## Similarity SQL (cosine)

`<=>` = cosine distance (lower is closer). Display score: `1 - distance`. The default is an exact scan; an HNSW index with `vector_cosine_ops` is an optional scale-up ([appendix A](./appendix-a-data-model.md#tables-postgresql)).

`$current_model` is the current `embedding` task model `identifier` (`{providerId}::{modelId}`).

```sql
SELECT
  c.id AS child_id,
  c.parent_id,
  c.page_id,
  c.text AS child_text,
  1 - (c.embedding <=> $1::vector) AS score
FROM kb_children c
WHERE c.embedding IS NOT NULL
  AND c.embedding_model IS NOT DISTINCT FROM $current_model
ORDER BY c.embedding <=> $1::vector
LIMIT $2;
```

## Expand to parents

```sql
SELECT p.id, p.text, pg.title
FROM kb_parents p
JOIN kb_pages pg ON pg.id = p.page_id
WHERE p.id = ANY($1::text[]);
```

## Image-description search

The same embedded question drives a **second vector search**, over `kb_image_descriptions.embedding`, independent of the child search. The description vectors are produced by [03.2-image-descriptions.md](./03.2-image-descriptions.md):

```sql
SELECT
  d.page_id,
  d.image_path,
  d.description,
  1 - (d.embedding <=> $1::vector) AS score
FROM kb_image_descriptions d
WHERE d.embedding IS NOT NULL
  AND d.embedding_model IS NOT DISTINCT FROM $current_model
  AND d.policy <> 'ignore'
ORDER BY d.embedding <=> $1::vector
LIMIT $2;
```

Its hits are capped and merged into the synthesis context, labelled with the page title.

## Stale vectors

A null `embedding`, or an `embedding_model` that differs from the current `embedding` task model `identifier`, excludes the row from search; repair it with a re-embed pass. Provider connection changes do not make vectors stale.
