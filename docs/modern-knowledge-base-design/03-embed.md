# Embed (children → vectors)

Write-path only: turn `kb_children.text` into `embedding` and store it. Query is [appendix-b-vector-search.md](./appendix-b-vector-search.md). Chunk roles: [02-chunkify.md](./02-chunkify.md). Schema: [appendix-a-data-model.md](./appendix-a-data-model.md). Ingest skip/replace: [01-ingest.md](./01-ingest.md).

```text
hash check → optional replace → chunkify → persist (embeddings null) → embed children
```

Parents are not embedded. The LLM sees parent text at query time, not at embed time.

## Provider

Talk to **Ollama** through an **embedder** interface (`embed(texts) → vectors`). The Ollama client is one implementation. Callers (page embed, later question embed) must not import Ollama HTTP details.

Default model id: **`nomic-embed-text:latest`**. Match `vector(N)` to that model’s dimensions (`nomic-embed-text` is 768). Cosine distance (`<=>`) for search.

## Model in the database

**Current model** (what new embeds use) lives in the DB, same idea as chunk knobs: nullable column, **app default in code** when missing.

Shape: single row `id = 'default'` (own table, or a column next to chunk settings). Store at least `embedding_model` (text). Example default when the column is null: `nomic-embed-text:latest`.

**Each child** also stores what produced its vector: `kb_children.embedding_model` and `embedded_at`. Search and re-embed compare the child to the **current** DB model, not a hardcoded string.

Changing the current model does not rewrite vectors until a re-embed pass. Children with a different `embedding_model` (or null `embedding`) are stale.

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

Upsert per child or small batches. A failed batch must not erase vectors already written; retry remaining stale/null rows. Do not wrap a whole page’s embeds in one transaction.

## Stale at query time

Null `embedding` or `embedding_model` ≠ current model → exclude from similarity search (or repair via this embed pass).
