# Embed (children → vectors)

Write-path only: turn `kb_children.text` into `embedding` and store it. Query is [04-query.md](./04-query.md). Chunk roles: [02-chunkify.md](./02-chunkify.md). Schema: [appendix-a-data-model.md](./appendix-a-data-model.md). Ingest skip/replace: [01-ingest.md](./01-ingest.md).

```text
hash check → optional replace → chunkify → persist (embeddings null) → embed children
```

Parents are not embedded. The LLM sees parent text at query time, not at embed time.

This doc is the **embed contract**: read `kb_embed_settings`, call the provider (first: Ollama) with `child.text`, store the vector. Retry, timeouts, jobs, and admin APIs are application layer.

## Provider

Talk to the provider through an **embedder** interface (`embed(texts) → vectors`). The first implementation is **Ollama**. Callers (page embed, later question embed) must not import HTTP details.

**All embed runtime config lives in Postgres** (`kb_embed_settings`), not in env: current model, provider, host, port, API key (when used). `DATABASE_URL` remains process env so the app can reach the database.

Default model id when the settings row is missing or `embedding_model` is null: **`nomic-embed-text:latest`**. Match `vector(N)` to that model’s dimensions (`nomic-embed-text` is 768). Cosine distance (`<=>`) for search. Changing width is a **schema migration**, not a settings-row flip.

## Settings in the database

Dedicated table `kb_embed_settings`, same idea as chunk knobs: single row `id = 'default'`, **nullable columns**, **app defaults in code** when missing. Schema: [appendix-a-data-model.md](./appendix-a-data-model.md#embed-settings-table).

Two kinds of fields:

| Kind                         | Columns                               | Changing it                                                                                                                         |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Vector identity**          | `embedding_model`                     | Children with a different `embedding_model` (or null `embedding`) are stale; re-embed pass. Search compares children to this value. |
| **How we call the provider** | `provider`, `host`, `port`, `api_key` | Next embed/query call only. Do **not** rewrite or exclude vectors. Do **not** snapshot host/key onto each child.                    |

**Each child** stores only `kb_children.embedding_model` and `embedded_at` (what produced that vector). Compare the child to the **current** `kb_embed_settings.embedding_model` (after applying the app default), not a hardcoded string.

Changing the current model does not rewrite vectors until a re-embed pass.

## Input

Embed `child.text` as stored by `chunkify`. **No** page-title prefix until a later decision. Query must use the same policy on the question.

If the text exceeds the model’s input limit, skip that child and leave `embedding` null (search already excludes nulls). Do not silent-truncate.

## Which children

Embed rows where:

```sql
embedding IS NULL
OR embedding_model IS DISTINCT FROM $current_model
```

After a page replace, scope with `page_id`. When only the stored current model changed, run the same predicate across all pages (no content-hash skip for vectors).

Page hash skip ([01-ingest.md](./01-ingest.md#incremental-updates-page-hash)) means do not re-chunk or re-embed that page.

## Write

```sql
UPDATE kb_children
SET
  embedding = $1::vector,
  embedding_model = $2,
  embedded_at = NOW()
WHERE id = $3;
```

Write per child. A failed call must not erase vectors already stored. Do not wrap a whole page’s embeds in one transaction. Retry and batch size are application layer.

## Stale at query time

Null `embedding` or `embedding_model` ≠ current `kb_embed_settings.embedding_model` (after app default) → exclude from similarity search (or repair via this embed pass). Host / port / API key do not affect this check.
