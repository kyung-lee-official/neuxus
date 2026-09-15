# Knowledge-base design

Write path: corpus → ingest → chunkify, and corpus → ingest → image descriptions. Read path: query → synthesis. **Embed is not a flow step** — it is a utility the write steps and query call to produce and use vectors.

Every step is gated by a stored hash, so re-running a sync with unchanged input is all skips. Ingest and chunkify are **separate** steps: ingest writes `kb_pages` and the per-image policy; chunkify fills `kb_parents` / `kb_children` only when the page content changed.

```mermaid
---
theme: neo-dark
---
flowchart LR
  corpus[01 corpus] --> ingest[02 ingest]
  ingest --> chunkify[03 chunkify]
  ingest --> imagedesc[04 image descriptions]
  chunkify -. uses .-> embed[05 embed utility]
  imagedesc -. uses .-> embed
  query[06 query] -. uses .-> embed
  query --> synthesis[07 synthesis]
```

| Doc                                                    | Kind      | Contract                                                                                   |
| ------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------ |
| [01-corpus.md](./01-corpus.md)                         | step      | Git checkout → markdown files + sibling `*.meta.yaml` (`slug`, `source_path`, sync at SHA) |
| [02-ingest.md](./02-ingest.md)                         | step      | Markdown file → `kb_pages` + per-image policy in `kb_image_descriptions` (frontmatter, hash skip) |
| [03-chunkify.md](./03-chunkify.md)                     | step      | `kb_pages.body` → parents / children                                                       |
| [04-image-descriptions.md](./04-image-descriptions.md) | step      | `*.meta.yaml` → image captions + description vectors                                       |
| [05-embed.md](./05-embed.md)                           | utility   | Text → vectors (called by chunkify, image descriptions, query)                             |
| [06-query.md](./06-query.md)                           | step      | Question → ranked parents (+ ranked image descriptions)                                     |
| [07-synthesis.md](./07-synthesis.md)                   | step      | Prompt → answer (image syntax replaced ephemerally)                                         |
| [appendix-a-data-model.md](./appendix-a-data-model.md) | reference | Tables                                                                                     |

## Freshness keys

| Unit                        | Skip when                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ingest (page)               | `kb_pages.content_hash` and `kb_pages.meta_hash` both match                                            |
| Chunkify (page)             | the page's chunk tree carries `source_page_hash` = `kb_pages.content_hash`                             |
| Caption (image)             | `image_content_hash`, `caption_model`, `caption_prompt_version`, and `policy` all match the stored row |
| Embed utility (any vector)  | `embedding_model` = the current `embedding` task model `identifier` (`{providerId}::{modelId}`)         |

The embedding, captioning, and synthesis models are application wiring: [`app_model_task_config`](./appendix-a-data-model.md#model-config-tables) task links, with provider connections in `app_model_provider_config`. No `kb_*` settings table holds a model id.
