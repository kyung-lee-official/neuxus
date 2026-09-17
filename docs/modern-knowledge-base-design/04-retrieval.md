# Query (question → parents)

Read-path: embed the question, similarity-search `kb_children.embedding`, expand to parents for the LLM.

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

Vector-only for now. Optional later: hybrid FTS + RRF.

## Question embed

Read **`kb_embed_settings`** (same row as the write path): provider, host, port, API key, and current `embedding_model`, then apply app defaults for nulls. Embed the question with that client/model and `vector(N)`. Default model when unset: `nomic-embed-text:latest`.

### Embed input prefix

Stored `kb_children.text` is the chunk body from `chunkify` — no extra header. Optionally, **at embed time only**, prepend page context so similar children on different pages separate in vector space, for example:

```text
Title: Setup

Here is the setup code:
```

(`Setup` is the page title; the rest is `child.text`.)

If children are embedded with a prefix, embed the **question** with the same policy (same fields, same order). Mixing prefixed documents and a bare question mismatches the space.

This does not change parent/child spans. Skip the prefix until ingest needs it.

## Similarity SQL (cosine)

`<=>` = cosine distance (lower is closer). Display score: `1 - distance`. The default is an exact scan; an HNSW index with `vector_cosine_ops` is an optional scale-up ([appendix A](./appendix-a-data-model.md#tables-postgresql)).

`$current_model` is `kb_embed_settings.embedding_model` after app default.

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

| Operator | Use                        |
| -------- | -------------------------- |
| `<=>`    | Cosine distance            |
| `<->`    | L2                         |
| `<#>`    | Inner product (watch sign) |

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

Null `embedding` or `embedding_model` ≠ current `kb_embed_settings.embedding_model` (after app default) → exclude from search (or repair via re-embed; ). Host / port / API key changes do not make vectors stale.
