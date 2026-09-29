# Retrieval (question to ranked parents + image descriptions)

Question (string) in, ranked rows out.

A search query targets a **set** of one or more knowledge bases; the caller chooses the set ([Multiple knowledge bases](#multiple-knowledge-bases)).

Embed the question, similarity-search `kb_children.embedding`, expand to parents for the LLM.

## Flow

```text
1. Embed the question once (same model as children)
2. Similarity-search children in each knowledge base in the set
3. Resolve parents per knowledge base (+ page title)
4. Dedupe by `(knowledgeBaseId, parentId)`; keep best child score per parent
5. Cap the merged set by max parents / max characters
6. Similarity-search image descriptions in each knowledge base, independent of step 2 ([Image-description search](#image-description-search))
7. LLM gets parent texts (+ title) and image-description hits — not child windows alone ([05-synthesis.md](./05-synthesis.md))
```

Cap knobs (`child_limit`, `max_parents`, `max_characters`) come from the knowledge base's [`kb_retrieve_settings`](./appendix-a-data-model.md#retrieval-knobs-table); app defaults when null.

## Multiple knowledge bases

A request carries the knowledge-base ids it wants to query. The backend persists no grouping between them: a "domain" is an application-level concept, and a client that needs to discover valid ids reads the [`kb_knowledge_bases`](./appendix-a-data-model.md) registry.

The service validates the set — non-empty, every id exists — then queries exactly it. No caller-access restriction is applied for now; if one is added, it belongs in the service or controller layer and leaves the architecture unchanged.

Every knowledge base shares the one embedding model ([appendix A](./appendix-a-data-model.md)), so scores are comparable across them: the child hits merge and re-rank by score. Page and parent ids are unique only within one knowledge base, so merge and expand on `(knowledgeBaseId, parentId)` and `(knowledgeBaseId, pageId)`, then cap the merged ranking once, globally ([Flow](#flow)). Image hits merge the same way; a writable knowledge base is text-only ([appendix A](./appendix-a-data-model.md)), so it contributes no images.

### Open decisions

- **Knobs across a set.** Whether `child_limit` is per knowledge base with a global `max_parents` / `max_characters`, or one source governs the query.
- **Cross-knowledge-base labels.** How parents and images are labelled when two knowledge bases carry the same page title.

## Question embed

Embed the question with the current **embedding** model — the same model the children were embedded with — so the question and children share one vector space.

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
SELECT p.id, p.text, pg.title
FROM kb_parents p
JOIN kb_pages pg
  ON pg.knowledge_base_id = p.knowledge_base_id
 AND pg.id = p.page_id
WHERE p.knowledge_base_id = $kb
  AND p.id = ANY($1::text[]);
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
  AND d.knowledge_base_id = $kb
  AND d.policy <> 'ignore'
ORDER BY d.embedding <=> $1::vector
LIMIT $2;
```

Its hits are capped and merged into the synthesis context ([05-synthesis.md](./05-synthesis.md#image-handling)); an image hit carries only its description and page title.

## Stale vectors

A null `embedding`, or an `embedding_model` that differs from the current embedding model `identifier`, excludes the row from search; repair it with a re-embed pass. Provider connection changes do not make vectors stale.
