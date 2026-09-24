# Appendix A — Knowledge data model (knowledge bases, pages, chunks)

Relational store in **PostgreSQL**, with **pgvector** on `kb_children.embedding` and `kb_image_descriptions.embedding`.

## Entities

```text
Knowledge base ──* Page ──* Parent ──* Child (embedding)
Knowledge base ──* Page ──* Image description (embedding)
```

| Entity                | Role                                                                                                                                                     | `vector`? |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Knowledge base**    | Isolated knowledge set (e.g. one product); `writable` false = corpus-backed (ingest-written), true = directly written; pages and searches never cross it | No        |
| **Page**              | Markdown `body`: `id`, title, ingest-normalized [`body`](./02-ingest.md#body), `content_hash`, `meta_hash`                                               | No        |
| **Parent**            | Generation slice of `body`; `source_page_hash` records the `kb_pages.content_hash` it was built from                                                     | No        |
| **Child**             | Retrieval unit                                                                                                                                           | Yes       |
| **Image description** | Per-image caption vector; identity `(knowledge_base_id, page_id, image_path)`                                                                            | Yes       |

- Every content table carries `knowledge_base_id`; primary and foreign keys are scoped to it (`(knowledge_base_id, id)`), and retrieval filters by it. `kb_children` also denormalizes `page_id` for its scans.
- A **read-only** knowledge base (`kb_knowledge_bases.writable = false`) is written only by the **ingest** stage.
- A **writable** knowledge base (`kb_knowledge_bases.writable = true`) is updated directly, never by the ingest stage, and is **text-only** (no `kb_image_descriptions`).
- On page change: delete that page's parents/children, insert the new tree ([incremental updates](./02-ingest.md#incremental-updates-page-and-meta-hashes)).
- Each parent records `source_page_hash`, the `kb_pages.content_hash` the tree was built from; chunkify rebuilds a page's tree when it differs from the current `content_hash` ([chunk freshness](./README.md#freshness-keys)).

Keep `kb_*` namespaced apart from application tables (same database is fine).

## Tables (PostgreSQL)

Match `vector(N)` to the shared embedding model's dimensions. Apply schema changes with your usual migration process.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_knowledge_bases (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  writable   BOOLEAN NOT NULL DEFAULT false,  -- false: corpus-backed (ingest-written); true: directly written
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kb_pages (
  knowledge_base_id TEXT NOT NULL REFERENCES kb_knowledge_bases (id) ON DELETE CASCADE,
  id                TEXT NOT NULL,
  title             TEXT NOT NULL,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  body              TEXT NOT NULL,  -- markdown; ingest-normalized
  source_path       TEXT,           -- read-only KBs only; null otherwise
  content_hash      TEXT NOT NULL,
  meta_hash         TEXT,           -- sha256 of the sibling *.meta.yaml bytes; null when absent
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (knowledge_base_id, id)
);

CREATE TABLE kb_parents (
  knowledge_base_id TEXT NOT NULL,
  id                TEXT NOT NULL,
  page_id           TEXT NOT NULL,
  parent_index      INT NOT NULL,
  text              TEXT NOT NULL,
  source_page_hash  TEXT NOT NULL,  -- kb_pages.content_hash this tree was built from
  PRIMARY KEY (knowledge_base_id, id),
  UNIQUE (knowledge_base_id, page_id, parent_index),
  FOREIGN KEY (knowledge_base_id, page_id)
    REFERENCES kb_pages (knowledge_base_id, id) ON DELETE CASCADE
);

CREATE TABLE kb_children (
  knowledge_base_id TEXT NOT NULL,
  id                TEXT NOT NULL,
  parent_id         TEXT NOT NULL,
  page_id           TEXT NOT NULL,
  child_index       INT NOT NULL,
  text              TEXT NOT NULL,
  embedding         vector(768),    -- adjust N to the shared embedding model
  embedding_model   TEXT,
  embedded_at       TIMESTAMPTZ,
  PRIMARY KEY (knowledge_base_id, id),
  UNIQUE (knowledge_base_id, parent_id, child_index),
  FOREIGN KEY (knowledge_base_id, parent_id)
    REFERENCES kb_parents (knowledge_base_id, id) ON DELETE CASCADE,
  FOREIGN KEY (knowledge_base_id, page_id)
    REFERENCES kb_pages (knowledge_base_id, id) ON DELETE CASCADE
);

CREATE TABLE kb_image_descriptions (
  knowledge_base_id      TEXT NOT NULL,
  page_id                TEXT NOT NULL,
  image_path             TEXT NOT NULL,
  image_content_hash     TEXT NOT NULL,  -- sha256 of the image bytes
  policy                 TEXT NOT NULL,  -- ignore | manual | vision-captioning
  description            TEXT,           -- null for ignore / before caption
  caption_model          TEXT,           -- null for manual
  caption_prompt_hash    TEXT,           -- sha256 of the hardcoded caption prompt
  description_hash       TEXT,           -- sha256 of description
  embedding              vector(768),    -- adjust N to the shared embedding model
  embedding_model        TEXT,
  embedded_at            TIMESTAMPTZ,
  PRIMARY KEY (knowledge_base_id, page_id, image_path),
  FOREIGN KEY (knowledge_base_id, page_id)
    REFERENCES kb_pages (knowledge_base_id, id) ON DELETE CASCADE
);
```

| Concern                                        | Access                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| Page / parent / child text and metadata        | Ordinary SQL (or any ORM)                             |
| Insert / update `embedding`, similarity search | SQL against pgvector (ORM vector support is optional) |

> **No vector index by default.** Retrieval scans `kb_children.embedding` and `kb_image_descriptions.embedding` exactly — 100% recall, no tuning — which is fast at this scale. Add an HNSW index (`USING hnsw (embedding vector_cosine_ops)`) only when scaling up (large corpora or high query concurrency); accept approximate recall and the index build/maintenance cost.

> **One embed model across knowledge bases.** `vector(768)` is global: every knowledge base shares the same embedding model and dimensions.

## Corpus settings table

Per knowledge base: git remote **and** which commit line to follow ([01-corpus.md](./01-corpus.md#settings-in-the-database)). Not env. Nullable columns; **defaults live in application code**, not SQL `DEFAULT`. Missing row means **no remote** (`repo_url` null): do not clone; layout rules still apply to an explicit local checkout.

`repo_url` / `branch` / `docs_root` are how we fetch and where we walk. `last_synced_sha` is last successful sync (not vector identity). Changing the remote does not stale embeddings by itself; ingesting a different commit does. Do not log future credential columns.

App defaults (when null / no row): `repo_url` = none, `branch` = `main`, `docs_root` = `docs`, `last_synced_sha` = none.

```sql
CREATE TABLE kb_corpus_settings (
  knowledge_base_id TEXT PRIMARY KEY REFERENCES kb_knowledge_bases (id) ON DELETE CASCADE,
  repo_url          TEXT,
  branch            TEXT,
  docs_root         TEXT,
  last_synced_sha   TEXT
);
```

## Chunk knobs table

Per knowledge base. Nullable columns; **defaults live in application code** ([03.1-chunkify.md](./03.1-chunkify.md#knobs)), not SQL `DEFAULT`.

```sql
CREATE TABLE kb_chunk_settings (
  knowledge_base_id           TEXT PRIMARY KEY REFERENCES kb_knowledge_bases (id) ON DELETE CASCADE,
  child_target_tokens         INT,
  child_hard_max_tokens       INT,
  child_overlap_tokens        INT,
  child_crumb_min_tokens      INT,
  parent_max_tokens           INT,
  fence_intro_glue_max_tokens INT,
  tokenizer_encoding          TEXT
);
```

## Retrieval knobs table

Per knowledge base. Nullable columns; **defaults live in application code**, not SQL `DEFAULT`.

```sql
CREATE TABLE kb_retrieve_settings (
  knowledge_base_id TEXT PRIMARY KEY REFERENCES kb_knowledge_bases (id) ON DELETE CASCADE,
  child_limit       INT,
  max_parents       INT,
  max_characters    INT
);
```

## Model config tables

Model and provider wiring is application-level, not `kb_*`: `app_model_task_config` maps each app task to a catalog model, and `app_model_provider_config` holds provider connections. No `kb_*` table holds a model id.
