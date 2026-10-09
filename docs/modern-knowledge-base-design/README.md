# Knowledge-base design

- Write path
  - read-only knowledge bases flow from `corpus` through `ingest` to `chunkify` / image descriptions
  - writable ones flow from direct write to `chunkify`.

- Read path: retrieval, then synthesis.

Vectors are produced and consumed through a shared embed utility, not a flow step.

The stages are independent: each can run on its own, and its freshness key decides whether it does any work. Wiring them together (an application-level job, a "sync") is optional and application layer.

Content lives in **knowledge bases**: each is either **read-only** (pages ingested from a corpus and written only by the ingest stage) or **writable** (pages updated directly, not by ingest). Every write targets one knowledge base; a search query targets a set of one or more, specified by the request. The backend persists no grouping.

```mermaid
---
theme: neo-dark
---
flowchart LR
  corpus["01 corpus (source)"] --> ingest[02 ingest]
  ingest --> imagedesc[03.2 image descriptions]
  ingest --> chunkify[03.1 chunkify]
  direct[direct write] --> chunkify
  retrieval[04 retrieval] --> synthesis[05 synthesis]
  retrieval -. uses .-> embed[embed utility]
  chunkify -. uses .-> embed
  imagedesc -. uses .-> embed
  chunkify -. read by .-> retrieval
  imagedesc -. read by .-> retrieval
```

| Doc                                                        | Contract                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-corpus.md](./01-corpus.md)                             | Corpus layer: what content is in scope for ingest                                                                                                 |
| [02-ingest.md](./02-ingest.md)                             | Discover files; markdown file becomes a `kb_pages` row (frontmatter, hash skip); record each referenced image's policy in `kb_image_descriptions` |
| [03.1-chunkify.md](./03.1-chunkify.md)                     | Derive parents / children from `kb_pages.body`                                                                                                    |
| [03.2-image-descriptions.md](./03.2-image-descriptions.md) | Image captions + description vectors (policy from `*.meta.yaml`)                                                                                  |
| [04-retrieval.md](./04-retrieval.md)                       | Question in, ranked parents out (+ ranked image descriptions)                                                                                     |
| [05-synthesis.md](./05-synthesis.md)                       | Prompt in, answer out (image descriptions folded into the prompt)                                                                                 |
| [appendix-a-data-model.md](./appendix-a-data-model.md)     | Tables                                                                                                                                            |

## Freshness keys

Each stage derives a key from its inputs and compares it to the stored value; only a mismatch does work.

| Key (computed from)                                                                     | Computed At           | Compared At  | On mismatch                           |
| --------------------------------------------------------------------------------------- | --------------------- | ------------ | ------------------------------------- |
| `content_hash` (title + tags + body)                                                    | Ingest                | Ingest       | re-ingest the page                    |
| `meta_hash` (sibling `*.meta.yaml` bytes)                                               | Ingest                | Ingest       | record each referenced image's policy (and `manual` description) in `kb_image_descriptions`; delete rows for unreferenced images    |
| `source_page_hash` (the `content_hash` the tree was built from)                         | Chunkify              | Chunkify     | rebuild the parent/child tree         |
| `image_content_hash` (image bytes) · `caption_model` · `hardcoded_caption_prompt_hash`  | Caption pass          | Caption pass | re-caption (also if no `description`) |
| `embedding_model` (the vector's model)                                                  | Embed                 | Embed        | re-embed                              |
| `description_hash` (the current description)                                            | Caption pass / Ingest | Embed        | re-embed the image-description vector |
| `embedded_description_hash` (the description the vector was built from)                 | Embed                 | Embed        | re-embed the image-description vector |

The embedding, captioning, and synthesis models are application wiring: [`app_model_task_config`](./appendix-a-data-model.md#model-config-tables) task links, with provider connections in `app_model_provider_config`. No `kb_*` settings table holds a model id.
