# Query (question → parents)

Read-path: embed the question, similarity-search `kb_children.embedding`, expand to parents for the LLM. Schema/index: [appendix-a-data-model.md](./appendix-a-data-model.md). Chunk roles: [02-chunkify.md](./02-chunkify.md). Embed: [03-embed.md](./03-embed.md). Synthesis: [05-synthesis.md](./05-synthesis.md).

## Flow

```text
1. Embed the question (same model / dims as children)
2. Similarity-search children
3. Resolve parents (+ page title / slug)
4. Dedupe parents; keep best child score per parent
5. Cap by max parents / max characters
6. LLM gets parent texts (+ title / slug) — not child windows alone ([05-synthesis.md](./05-synthesis.md))
```

Vector-only for now. Optional later: hybrid FTS + RRF.

## Question embed

Read **`kb_embed_settings`** (same row as the write path): provider, host, port, API key, and current `embedding_model`, then apply app defaults for nulls ([03-embed.md](./03-embed.md#settings-in-the-database)). Embed the question with that client/model and `vector(N)`. Default model when unset: `nomic-embed-text:latest`.

### Embed input prefix

Stored `kb_children.text` is the chunk body from `chunkify` — no extra header. Optionally, **at embed time only**, prepend page context so similar children on different pages separate in vector space, for example:

```text
Title: Setup

Here is the setup code:
```

(`Setup` is the page title or slug; the rest is `child.text`.)

If children are embedded with a prefix, embed the **question** with the same policy (same fields, same order). Mixing prefixed documents and a bare question mismatches the space.

This does not change parent/child spans. Skip the prefix until ingest needs it ([03-embed.md](./03-embed.md#input)).

## Similarity SQL (cosine)

`<=>` = cosine distance (lower is closer). Display score: `1 - distance`. Prefer HNSW with `vector_cosine_ops` ([appendix-a](./appendix-a-data-model.md)).

`$current_model` is `kb_embed_settings.embedding_model` after app default ([03-embed.md](./03-embed.md#settings-in-the-database)).

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
SELECT p.id, p.text, pg.slug, pg.title
FROM kb_parents p
JOIN kb_pages pg ON pg.id = p.page_id
WHERE p.id = ANY($1::text[]);
```

## Stale vectors

Null `embedding` or `embedding_model` ≠ current `kb_embed_settings.embedding_model` (after app default) → exclude from search (or repair via re-embed; [03-embed.md](./03-embed.md)). Host / port / API key changes do not make vectors stale.
