# Ingest (file → page `body`)

Ingest turns a markdown **file** into page columns. Chunking starts after that: [02-chunkify.md](./02-chunkify.md). Embed: [03-embed.md](./03-embed.md). Query: [04-query.md](./04-query.md). Synthesis: [05-synthesis.md](./05-synthesis.md). Schema: [appendix-a-data-model.md](./appendix-a-data-model.md).

```text
file.md → strip leading YAML frontmatter → normalize → kb_pages.body → chunkify(body)
```

`title` / `tags` / `type` come from frontmatter (columns). **`body`** is the remaining markdown after ingest. `chunkify` never strips frontmatter.

## Frontmatter

Strip only if the file **begins** with `---\n` … closing `---\n` (optional newline after the closer). A later `---` in the body is a thematic break or content. Unclosed opening `---` is not frontmatter.

Recognized keys: `title`, `tags` (inline `[a, b]` or a YAML list), `type`. Trim string values at ingest.

## Body

Canonical `kb_pages.body`:

- `\r\n` / `\r` → `\n` (do this before detecting `---\n` so CRLF files still match)
- strip trailing spaces on each line
- ensure a single final `\n`
- no Unicode NFC (not required)

The same map is **idempotent**. `chunkify` may re-apply it; it does not strip YAML. CRLF round-trip is out of scope.

Hashes, offsets, and parent/child slices use this string — not original file bytes.

## Incremental updates (page hash)

Skip gate is the **page**, not each child. Hash a stable encoding of the stored ingest-normalized fields, for example:

```ts
sha256(
  JSON.stringify({ title, type: type ?? null, tags: [...tags].sort(), body }),
);
```

Do not concatenate raw strings (`title + type + tags + body`) — `ab`+`c` and `a`+`bc` collide.

| Situation                                                | Action                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| Hash match                                               | Skip                                                       |
| Hash differs                                             | Replace that page’s parent/child tree, then embed children |
| Same markdown, new embedding model (`kb_embed_settings`) | Re-embed stale children ([03-embed.md](./03-embed.md))     |

Shared path: hash check → optional replace → `chunkify` → embed → update `content_hash` / `embedding_model`.
