# Retrieval (query to ranked parents + image descriptions)

**Does** — embed the retrieval query once, then similarity-search `kb_children.embedding` and `kb_image_descriptions.embedding` in the selected knowledge base, expand child hits to parents, and return two capped lists (parents + image-description hits).

**Reads** — `kb_children`, `kb_parents`, `kb_pages.title`, `kb_image_descriptions`, `kb_knowledge_bases`; the global cap knobs ([`kb_retrieve_settings`](./appendix-a-data-model.md#retrieval-knobs-table)).

**Owns** — nothing (read-only).

**Staleness** — none; retrieval compares `embedding_model` at query time and excludes stale rows, whose owning stage re-embeds ([Stale vectors](#stale-vectors)).

**Never touches** — writes nothing.

## Flow

1. Embed the retrieval query once (same model as children; recent user turns may be included to resolve references)
2. Similarity-search children in the selected knowledge base
3. Resolve parents (+ page title)
4. Dedupe by `parentId`; keep best child score per parent
5. Cap the set by max parents / max characters
6. Similarity-search [image descriptions](#image-description-search) in the same knowledge base, independent of step 2
7. The enriched request gets parent texts (+ title) and image-description hits — not child windows alone ([05-synthesis.md](./05-synthesis.md))

Cap knobs (`child_limit`, `max_parents`, `max_characters`) are **global** ([`kb_retrieve_settings`](./appendix-a-data-model.md#retrieval-knobs-table), one row `id = "default"`) — they apply to the selected knowledge base's result. App defaults when null.

## Knowledge base selection

A request names one knowledge base: `X-Neuxus-Knowledge-Base` on `/v1/messages`, or `knowledgeBaseId` on `/retrieve` ([Appendix B](./appendix-b-protocol.md)). The service validates that the id exists and queries exactly it. Clients discover valid ids from the [`kb_knowledge_bases`](./appendix-a-data-model.md) registry.

The selected knowledge base uses the current embedding model ([appendix A](./appendix-a-data-model.md)), so scores are comparable within it. Page and parent ids are scoped to the knowledge base. Multi-KB retrieval is not part of this contract; it would be an additive change.

## Query embed

Embed the retrieval query with the current **embedding** model — the same model the children were embedded with — so the query and children share one vector space.

## Similarity SQL (cosine)

`<=>` = cosine distance (lower is closer). Display score: `1 - distance`.

`$current_model` is the current embedding model `identifier` (`{providerId}::{modelId}`).

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

Its top **3** hits (a hardcoded cap, not a knob) are merged into the synthesis context ([05-synthesis.md](./05-synthesis.md#image-handling)); the row shape is defined under [Result](#result).

## Result

Retrieval returns two independent lists:

| List                   | Row                                                                 |
| ---------------------- | ------------------------------------------------------------------- |
| Parents                | `{ knowledgeBaseId, parentId, pageId, title, text, score }`         |
| Image-description hits | `{ knowledgeBaseId, pageId, title, imagePath, description, score }` |

`05-synthesis.md` folds both into the `<knowledge>` block ([05-synthesis.md](./05-synthesis.md#image-handling)).

## Stale vectors

A null `embedding`, or an `embedding_model` that differs from the current embedding model `identifier`, excludes the row from search; the owning stage repairs it — **Chunkify** re-embeds children, the **Caption pass** re-embeds image descriptions. Provider connection changes do not make vectors stale.
