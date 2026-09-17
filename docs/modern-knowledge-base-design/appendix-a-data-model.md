# Appendix A — Knowledge data model (pages, parents, children)

Relational store in **PostgreSQL**, with **pgvector** on `kb_children.embedding` and `kb_image_descriptions.embedding`.

## Entities

```text
Page ──* Parent ──* Child (embedding)
Page ──* Image description (embedding)
```

| Entity                | Role                                                                                                                    | `vector`? |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| **Page**              | Markdown file: `id`, `source_path`, title, ingest-normalized [`body`](./02-ingest.md#body), `content_hash`, `meta_hash` | No        |
| **Parent**            | Generation slice of `body`; `source_page_hash` records the `kb_pages.content_hash` it was built from                    | No        |
| **Child**             | Retrieval unit                                                                                                          | Yes       |
| **Image description** | Per-image caption vector; identity `(page_id, image_path)`                                                              | Yes       |

FKs: `kb_parents.page_id → kb_pages`, `kb_children.parent_id → kb_parents`. Optional denormalized `kb_children.page_id`; optional `start_offset` / `end_offset` into page `body` ([normalized at ingest](./02-ingest.md#body)). On page change: delete that page’s parents/children, insert the new tree ([incremental updates](./02-ingest.md#incremental-updates-page-and-meta-hashes)). Each parent records `source_page_hash`, the `kb_pages.content_hash` the tree was built from; chunkify rebuilds a page's tree when it differs from the current `content_hash` ([chunk freshness](./README.md#freshness-keys)).

Keep `kb_*` namespaced apart from application tables (same database is fine).

## Tables (PostgreSQL)

Match `vector(N)` to the embedding model dimensions. Apply schema changes with your usual migration process.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_pages (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  body         TEXT NOT NULL,  -- ingest: newlines, strip trailing spaces, final \n
  source_path  TEXT,
  content_hash TEXT NOT NULL,
  meta_hash    TEXT,           -- sha256 of the sibling *.meta.yaml bytes; null when absent
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kb_parents (
  id               TEXT PRIMARY KEY,
  page_id          TEXT NOT NULL REFERENCES kb_pages (id) ON DELETE CASCADE,
  parent_index     INT NOT NULL,
  text             TEXT NOT NULL,
  source_page_hash TEXT NOT NULL,  -- kb_pages.content_hash this tree was built from
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

CREATE TABLE kb_image_descriptions (
  page_id                TEXT NOT NULL REFERENCES kb_pages (id) ON DELETE CASCADE,
  image_path             TEXT NOT NULL,
  image_content_hash     TEXT NOT NULL,  -- sha256 of the image bytes
  policy                 TEXT NOT NULL,  -- ignore | manual | vision-captioning
  description            TEXT,           -- null for ignore / before caption
  caption_model          TEXT,           -- null for manual
  caption_prompt_hash    TEXT,           -- sha256 of the hardcoded caption prompt
  description_hash       TEXT,           -- sha256 of description
  embedding              vector(768),    -- adjust N to the embedding model
  embedding_model        TEXT,
  embedded_at            TIMESTAMPTZ,
  PRIMARY KEY (page_id, image_path)
);

```

| Concern                                        | Access                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| Page / parent / child text and metadata        | Ordinary SQL (or any ORM)                             |
| Insert / update `embedding`, similarity search | SQL against pgvector (ORM vector support is optional) |

> **No vector index by default.** Retrieval scans `kb_children.embedding` and `kb_image_descriptions.embedding` exactly — 100% recall, no tuning — which is fast at this scale. Add an HNSW index (`USING hnsw (embedding vector_cosine_ops)`) only when scaling up (large corpora or high query concurrency); accept approximate recall and the index build/maintenance cost.

## Corpus settings table

Runtime corpus connection ([01-corpus.md](./01-corpus.md#settings-in-the-database)): git remote **and** which commit line to follow. Not env. Nullable columns; **defaults live in application code**, not SQL `DEFAULT`. Single row `id = 'default'`. Empty/missing row means **no remote** (`repo_url` null): do not clone; layout rules still apply to an explicit local checkout.

`repo_url` / `branch` / `docs_root` are how we fetch and where we walk. `last_synced_sha` is last successful sync (not vector identity). Changing the remote does not stale embeddings by itself; the next SHA sync does. Do not log future credential columns.

App defaults (when null / no row): `repo_url` = none, `branch` = `main`, `docs_root` = `docs`, `last_synced_sha` = none.

```sql
CREATE TABLE kb_corpus_settings (
  id               TEXT PRIMARY KEY DEFAULT 'default',
  repo_url         TEXT,
  branch           TEXT,
  docs_root        TEXT,
  last_synced_sha  TEXT
);
```

## Chunk knobs table

Nullable columns; **defaults live in application code** ([03.1-chunkify.md](./03.1-chunkify.md#knobs)), not SQL `DEFAULT`. Shape: single row `id = 'default'`.

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

Runtime embed config: model **and** how to reach the provider (host, port, API key). Not env. Nullable columns; **defaults live in application code**, not SQL `DEFAULT`. Single row `id = 'default'`. Empty/missing row must still embed using those defaults.

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

Runtime synthesis config ([05-synthesis.md](./05-synthesis.md#settings-in-the-database)): how to reach the LLM (provider, model, base URL, API key, max tokens) and **`context_window_tokens`** (must be known before `synthesize`). Not env. Not a `kb_*` table — Ask uses this for memory + chat + knowledge parents. Nullable columns; **defaults live in application code**, not SQL `DEFAULT`. Single row `id = 'default'`. Empty/missing row must still synthesize using those defaults. Clearing columns is a reset to MiniMax.

Do not log `api_key`. Changing these fields does not stale embeddings.

App defaults (when null / no row): `provider` = `minimax`, `synthesis_model` = `MiniMax-M3`, `base_url` = `https://api.minimaxi.com/anthropic`, `max_tokens` = `4096`, `context_window_tokens` = `1000000`.

```sql
CREATE TABLE app_synthesis_settings (
  id                     TEXT PRIMARY KEY DEFAULT 'default',
  provider               TEXT,
  synthesis_model        TEXT,
  base_url               TEXT,
  api_key                TEXT,
  max_tokens             INT,
  context_window_tokens  INT
);
```
