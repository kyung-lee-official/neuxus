# Appendix A — Knowledge data model (pages, parents, children)

Relational store in **PostgreSQL**, with **pgvector** on `kb_children.embedding`. Ingest: [01-ingest.md](./01-ingest.md). Chunking: [02-chunkify.md](./02-chunkify.md). Embed: [03-embed.md](./03-embed.md). Query: [04-query.md](./04-query.md). Synthesis: [05-synthesis.md](./05-synthesis.md).

## Entities

```text
Page ──* Parent ──* Child (embedding)
```

| Entity     | Role                                                                                        | `vector`? |
| ---------- | ------------------------------------------------------------------------------------------- | --------- |
| **Page**   | Markdown file: slug, title, ingest-normalized [`body`](./01-ingest.md#body), `content_hash` | No        |
| **Parent** | Generation slice of `body`                                                                  | No        |
| **Child**  | Retrieval unit                                                                              | Yes       |

FKs: `kb_parents.page_id → kb_pages`, `kb_children.parent_id → kb_parents`. Optional denormalized `kb_children.page_id`; optional `start_offset` / `end_offset` into page `body` ([normalized at ingest](./01-ingest.md#body)). On page change: delete that page’s parents/children, insert the new tree ([incremental updates](./01-ingest.md#incremental-updates-page-hash)).

Keep `kb_*` namespaced apart from application tables (same database is fine).

## Tables (PostgreSQL)

Match `vector(N)` to the embedding model dimensions. Apply schema changes with your usual migration process.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_pages (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  type         TEXT,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  body         TEXT NOT NULL,  -- ingest: newlines, strip trailing spaces, final \n
  source_path  TEXT,
  content_hash TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kb_parents (
  id           TEXT PRIMARY KEY,
  page_id      TEXT NOT NULL REFERENCES kb_pages (id) ON DELETE CASCADE,
  parent_index INT NOT NULL,
  text         TEXT NOT NULL,
  -- optional: start_offset INT, end_offset INT
  UNIQUE (page_id, parent_index)
);

CREATE TABLE kb_children (
  id              TEXT PRIMARY KEY,
  parent_id       TEXT NOT NULL REFERENCES kb_parents (id) ON DELETE CASCADE,
  page_id         TEXT NOT NULL,  -- optional denorm; add FK to kb_pages if desired
  child_index     INT NOT NULL,
  text            TEXT NOT NULL,
  embedding       vector(768),    -- adjust N to the embedding model
  embedding_model TEXT,
  embedded_at     TIMESTAMPTZ,
  UNIQUE (parent_id, child_index)
);

CREATE INDEX kb_children_embedding_hnsw
  ON kb_children
  USING hnsw (embedding vector_cosine_ops);
```

| Concern                                        | Access                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| Page / parent / child text and metadata        | Ordinary SQL (or any ORM)                             |
| Insert / update `embedding`, similarity search | SQL against pgvector (ORM vector support is optional) |

## Chunk knobs table

Nullable columns; **defaults live in application code** ([02-chunkify.md](./02-chunkify.md#knobs)), not SQL `DEFAULT`. Shape: single row `id = 'default'`.

```sql
CREATE TABLE kb_chunk_settings (
  id                          TEXT PRIMARY KEY DEFAULT 'default',
  child_target_tokens         INT,
  child_hard_max_tokens       INT,
  child_overlap_tokens        INT,
  child_crumb_min_tokens      INT,
  parent_max_tokens           INT,
  fence_intro_glue_max_tokens INT,
  tokenizer_encoding          TEXT
);
```

## Embed settings table

Runtime embed config ([03-embed.md](./03-embed.md#settings-in-the-database)): model **and** how to reach the provider (host, port, API key). Not env. Nullable columns; **defaults live in application code**, not SQL `DEFAULT`. Single row `id = 'default'`. Empty/missing row must still embed using those defaults.

`embedding_model` is vector identity (compare to `kb_children.embedding_model`). `provider` / `host` / `port` / `api_key` are connection only — changing them does not stale children. Do not log `api_key`.

App defaults (when null / no row): `embedding_model` = `nomic-embed-text:latest`, `provider` = `ollama`, `host` = `127.0.0.1`, `port` = `11434`, `api_key` unused for typical Ollama. `vector(N)` stays a schema fact (768 for that default model).

```sql
CREATE TABLE kb_embed_settings (
  id               TEXT PRIMARY KEY DEFAULT 'default',
  embedding_model  TEXT,
  provider         TEXT,
  host             TEXT,
  port             INT,
  api_key          TEXT
);
```

## Synthesis settings table

Runtime synthesis config ([05-synthesis.md](./05-synthesis.md#settings-in-the-database)): how to reach the LLM (provider, model, base URL, API key, max tokens). Not env. Not a `kb_*` table — Ask uses this for memory + chat + knowledge parents. Nullable columns; **defaults live in application code**, not SQL `DEFAULT`. Single row `id = 'default'`. Empty/missing row must still synthesize using those defaults. Clearing columns is a reset to MiniMax.

Do not log `api_key`. Changing these fields does not stale embeddings.

App defaults (when null / no row): `provider` = `minimax`, `synthesis_model` = `MiniMax-M3`, `base_url` = `https://api.minimaxi.com/anthropic`, `max_tokens` = `4096`.

```sql
CREATE TABLE app_synthesis_settings (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  provider          TEXT,
  synthesis_model   TEXT,
  base_url          TEXT,
  api_key           TEXT,
  max_tokens        INT
);
```
