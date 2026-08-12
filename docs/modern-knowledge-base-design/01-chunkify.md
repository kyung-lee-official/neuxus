# Chunkify strategy (parent–child + structure-first)

**Parents** = generation context. **Children** = retrieval units (embedded). Structure decides parents; size only refines children and oversized parents. Do not slice the whole file every N characters as the first step.

Related: [appendix-a-data-model.md](./appendix-a-data-model.md) (tables / Prisma), [appendix-b-vector-search.md](./appendix-b-vector-search.md) (query-time search).

## Why parent–child

| Classic RAG  | Problem                             |
| ------------ | ----------------------------------- |
| Small chunks | Precise retrieval, thin LLM context |
| Large chunks | Better context, blurry embeddings   |

| Role                           | Purpose                       | Embedded? |
| ------------------------------ | ----------------------------- | --------- |
| **Child** (~300–450 tokens)    | Search / match                | Yes       |
| **Parent** (~1000–1600 tokens) | LLM context when a child hits | No        |

Child size is limited mainly by **embedding precision**. Parent size is limited by **useful context** (+ remaining LLM budget). The model context window is secondary.

## How parent and child connect

One markdown **page** owns many **parents**; each parent owns many **children**. The link is many-to-one: every child points at exactly one parent; parents never embed, children never go to the LLM.

```text
page (slug, title, body)
  └── parent  (section / size-capped slice of body)
        ├── child  → embedding   (search hit)
        ├── child  → embedding
        └── …
```

**Identity and lookup**

| Link             | Meaning                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `child → parent` | Required foreign key (or stable parent key). A search hit resolves context by loading this parent’s text.              |
| `parent → page`  | Parent belongs to one page (`slug` / page id) for citation and title.                                                  |
| Offsets          | Optional `start` / `end` in `body` so parent/child text can be re-sliced or debugged without storing divergent copies. |

**Invariants**

- Children are built **only inside** their parent’s span; no child crosses a parent boundary.
- Sibling overlap (when used) stays within that parent.
- On page edit: replace that page’s parents and children together, then re-embed children (no orphan vectors from an old layout).
- At query time: rank **children** → collect unique **parents** → budget → send parent text (+ page title / slug) to the LLM.

## How we build chunks

**Input:** page `body` only (frontmatter stripped). Preserve fences, lists, and `<!-- image-desc -->` with their owning section.

### Parents (structure-first)

1. Prefer one parent per `##` section (heading + body until next `##`).
2. No `##` → whole body is one parent (typical short notes).
3. If a section still exceeds `parentMax` (~1000–1600 tokens): split on `###`, then pack blank-line paragraphs ≤ max.
4. Never orphan a fence or image-desc from its intro when splitting.

### Children (inside each parent only)

1. Split on paragraphs / list blocks / fences (keep fences atomic when possible).
2. Pack to **~300–450 tokens** (hard max ~500).
3. Overlap **~40–80 tokens** only after a forced hard split.
4. Merge crumbs under ~50–80 tokens into the previous child.
5. Persist each child with `parent_id` (and page / offsets as needed).

### Degenerate cases

| Page                    | Parents                            | Children             |
| ----------------------- | ---------------------------------- | -------------------- |
| Short body ≤ parent max | 1 = full body                      | Often 1 (or a few)   |
| Normal `##` doc         | 1 per `##`                         | Several per parent   |
| Huge `##`               | Sub-parents via `###` / paragraphs | Children inside each |

## Query path

```text
question → embed → search children only
        → expand to unique parents (via child → parent)
        → dedupe / merge overlapping parents
        → apply budget (max parents / max characters)
        → LLM sees parent texts (+ page title / slug)
```

Do not send children to the LLM. Short pages: one small parent ≈ full body.

## Defaults (tech markdown)

| Knob                    | Value                                      |
| ----------------------- | ------------------------------------------ |
| Child target / hard max | 300–450 / ~500 tokens                      |
| Child overlap           | 40–80 tokens (forced splits only)          |
| Parent target / max     | 1000–1600 tokens                           |
| Parent boundaries       | `##` → `###` → paragraphs                  |
| Embed                   | Children only (optional `Title: …` prefix) |
| LLM context             | Deduped parents under a character budget   |

## Incremental updates (page hash)

The skip gate is the **markdown page**, not each child. Store `pages.content_hash` over stable fields (normalize newlines first), for example:

`sha256(title + type + tags + body)`

| Situation                                   | Action                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Hash matches stored page                    | Skip — no re-chunk, no re-embed                                   |
| Hash differs                                | Replace that page’s parents and children, then embed new children |
| Markdown unchanged, embedding model changed | Re-embed children whose `embedding_model` (or signature) is stale |

Do not rely on per-child file hashes as the primary gate: you would still parse every file to know what changed. Optional child/parent text hashes are fine later for debugging; v1 replace-on-page-change is enough.

### Manual maintenance API

Expose operators (CLI and/or admin HTTP) so a human can drive the same logic without a full tree walk:

| Operation                | Behavior                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Compare hashes           | For one slug or the whole tree: report `in_sync` / `stale` / `missing_in_db` / `missing_on_disk`                                   |
| Re-chunk + re-embed page | Force rebuild parents/children for a slug (ignore hash equality), write new vectors                                                |
| Re-embed stale           | Embed children with null vector or mismatched `embedding_model`, without re-parsing unchanged pages when layout is already current |
| Update vectors           | Persist new embeddings onto existing child rows after a successful embed call                                                      |

Ingest and these APIs share one code path: hash check → optional replace tree → embed children → update `content_hash` / `embedding_model`.

See also [appendix-a-data-model.md](./appendix-a-data-model.md) (tables / Prisma) and [appendix-b-vector-search.md](./appendix-b-vector-search.md) (query-time search).

## One-line rule

**Parents = markdown sections (size-capped); children = small packs inside a parent for search; LLM gets parents via the child → parent link.**
