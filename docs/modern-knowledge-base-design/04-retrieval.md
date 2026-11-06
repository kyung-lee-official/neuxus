# Retrieval (query to ranked parents + image descriptions)

**Does** — embed the retrieval query once, then similarity-search `kb_children.embedding` and `kb_image_descriptions.embedding` for every valid requested knowledge base, expand child hits to parents, merge the successful bases, and return two globally capped lists (parents + image-description hits).

**Reads** — `kb_children`, `kb_parents`, `kb_pages.title`, `kb_image_descriptions`, `kb_knowledge_bases`; the global cap knobs ([`kb_retrieve_settings`](./appendix-a-data-model.md#retrieval-knobs-table)).

**Owns** — nothing (read-only).

**Staleness** — none; retrieval compares `embedding_model` at query time and excludes stale rows, whose owning stage re-embeds ([Stale vectors](#stale-vectors)).

**Never touches** — writes nothing.

## Flow

1. Normalize and deduplicate the requested `knowledgeBaseIds`.
2. Resolve the current embedding model and embed the retrieval query once.
3. Similarity-search children in each valid knowledge base.
4. Resolve parents (+ page title) per knowledge base.
5. Deduplicate parents by `(knowledgeBaseId, parentId)`; keep the best child score per parent.
6. Merge all successful parents and apply the global max-parents / max-characters cap.
7. Similarity-search [image descriptions](#image-description-search) in each knowledge base, independent of step 3.
8. Merge image hits by `(knowledgeBaseId, pageId, imagePath)`, then apply the global image cap.

Cap knobs (`child_limit`, `max_parents`, `max_characters`) are **global** ([`kb_retrieve_settings`](./appendix-a-data-model.md#retrieval-knobs-table), one row `id = "default"`). They apply to the merged result. App defaults when null.

Multi-KB retrieval is a supplement, not a coverage guarantee: one knowledge base may contribute every parent, and another may contribute none. There are no per-KB quotas.

## Knowledge base selection

A request names one or more knowledge bases with the required `knowledgeBaseIds` body array on both `/v1/messages` and `/retrieve` ([Appendix B](./appendix-b-protocol.md)). A single-KB request is a one-element array.

Clients discover valid ids from the [`kb_knowledge_bases`](./appendix-a-data-model.md) registry.

The retriever validates each requested ID:

- A missing KB is skipped and reported as a warning when at least one other KB succeeds.
- A valid KB that returns no hits is not a failure.
- If every requested KB fails, the request returns an error instead of an empty successful result.

## Query embed

Embed the retrieval query with the current **embedding** model — the same model the children were embedded with — so the query and all requested knowledge bases share one vector space.

## Similarity SQL (cosine)

`<=>` = cosine distance (lower is closer). Display score: `1 - distance`.

`$current_model` is the current embedding model `identifier` (`{providerId}::{modelId}`). The search runs once per knowledge base so a single KB failure can be isolated.

```sql
SELECT
  c.knowledge_base_id,
  c.id AS child_id,
  c.parent_id,
  c.page_id,
  c.text AS child_text,
  1 - (c.embedding <=> $1::vector) AS score
FROM kb_children c
WHERE c.embedding IS NOT NULL
  AND c.embedding_model IS NOT DISTINCT FROM $current_model
  AND c.knowledge_base_id = $kb
ORDER BY c.embedding <=> $1::vector
LIMIT $2;
```

## Expand to parents

```sql
SELECT p.knowledge_base_id, p.id, p.text, pg.title
FROM kb_parents p
JOIN kb_pages pg
  ON pg.knowledge_base_id = p.knowledge_base_id
 AND pg.id = p.page_id
WHERE p.knowledge_base_id = $kb
  AND p.id = ANY($1::text[]);
```

Parent identity is `(knowledgeBaseId, parentId)`; never key a merged map by bare `parentId`.

## Image-description search

The same embedded retrieval query drives a **second vector search**, over `kb_image_descriptions.embedding`, independent of the child search. The description vectors are produced by [03.2-image-descriptions.md](./03.2-image-descriptions.md):

```sql
SELECT
  d.knowledge_base_id,
  d.page_id,
  d.image_path,
  d.description,
  pg.title,
  1 - (d.embedding <=> $1::vector) AS score
FROM kb_image_descriptions d
JOIN kb_pages pg
  ON pg.knowledge_base_id = d.knowledge_base_id
 AND pg.id = d.page_id
WHERE d.embedding IS NOT NULL
  AND d.embedding_model IS NOT DISTINCT FROM $current_model
  AND d.knowledge_base_id = $kb
  AND d.policy <> 'ignore'
ORDER BY d.embedding <=> $1::vector
LIMIT 3;
```

Each KB returns up to 3 image hits. Merge all successful hits, sort by score, and keep the global top 3 (a hardcoded cap, not a knob).

## Result

Retrieval returns two independent lists:

| List                   | Row                                                                 |
| ---------------------- | ------------------------------------------------------------------- |
| Parents                | `{ knowledgeBaseId, parentId, pageId, title, text, score }`         |
| Image-description hits | `{ knowledgeBaseId, pageId, title, imagePath, description, score }` |

Both lists are ordered by score, best first. Ties are broken deterministically by the composite key.

`05-synthesis.md` folds both into the `<knowledge>` block ([05-synthesis.md](./05-synthesis.md#image-handling)).

## Partial failure

When at least one KB succeeds, retrieval returns the merged results from successful KBs and reports missing/failed KBs as warnings. When every requested KB fails, retrieval throws instead of returning a successful empty result.

## Stale vectors

A null `embedding`, or an `embedding_model` that differs from the current embedding model `identifier`, excludes the row from search; the owning stage repairs it — **Chunkify** re-embeds children, the **Caption pass** re-embeds image descriptions. Provider connection changes do not make vectors stale.
