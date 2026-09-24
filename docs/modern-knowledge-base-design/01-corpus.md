# Corpus layout

Walking the corpus is the [ingest stage's](./02-ingest.md) job. This doc defines the layout it relies on: docs root, include/exclude, how a path maps to `source_path` / `id`, and hierarchy.

Folder depth is an **authoring** choice: how authors organize the repo. It is not the chunk parent/child tree ([03.1-chunkify.md](./03.1-chunkify.md)).

## Source of truth

The markdown corpus lives in its **own git repository**, separate from the app. Authors write and review it there. The app only reads a chosen commit and shows the pages it imported; it never edits content — you change markdown in git, not the app. A corpus backs a **read-only** knowledge base: its pages are updated only by the ingest flow ([appendix A](./appendix-a-data-model.md)).

A local directory that matches this layout is valid.

## Settings in the database

Where a knowledge base reads its corpus from — the git repository URL, the branch, and an optional docs-root subfolder — is stored in Postgres (`kb_corpus_settings`), not in environment variables. The row also records the last commit ingested. `DATABASE_URL` stays an environment variable so the app can reach the database.

One row per knowledge base, keyed by `knowledge_base_id`; **nullable columns**, **app defaults in code** when missing.

`repo_url` has **no** useful app default. Null / missing means no repository is configured.

Changing `repo_url` / `branch` does not rewrite `kb_pages`; the next ingest re-applies this contract for that knowledge base, including deletes.

## Docs root

Only this tree is ingested:

```text
kb.git/                       # docs root = repo root (default)
  README.md                   # ingested (id `README`)
  <parent>/
    <page>.md                 # ingested (id `<parent>/<page>`)
    <subdir>/
      <page>.md               # ingested (id `<parent>/<subdir>/<page>`)
  CHANGELOG.md                # ingested
  .github/                    # not ingested (dot segment)
```

| Rule            | Behavior                                                         |
| --------------- | ---------------------------------------------------------------- |
| Docs root       | empty → walk the repo root (default)                             |
| Docs root       | non-empty relative path → walk that subdirectory                 |
| Missing path    | fail the walk (only when an explicit non-empty docs root is set) |
| Path separators | POSIX `/` in stored `source_path`, even on Windows               |

The `docs_root` column on `kb_corpus_settings` overrides the empty default. `null` and `""` both mean "walk the repo root". A non-empty value (e.g. `docs`, `content`) restricts the walk to that subdirectory.

## Include and exclude

Walk **recursively** under the docs root.

| Include                                | Exclude                                         |
| -------------------------------------- | ----------------------------------------------- |
| Regular files whose name ends in `.md` | Any path with a component that starts with `.`  |
| UTF-8 text                             | Symlinks that resolve **outside** the docs root |
| Nested directories, any depth          | Non-`.md` files (not pages)                     |

`<docs-root>/README.md` **is** ingested (`id` `README`). Empty files still go through ingest (empty `body` after normalize is allowed).

## Hierarchy

Folders organize the corpus repo and set each page's `source_path` and `id`. `kb_pages` is **flat** — one file → one row, at any folder depth. Folder depth is **not** the chunk parent/child tree.

```text
# docs_root = "" (default)
<parent>/<page>.md             → id <parent>/<page>
<parent>/<subdir>/<page>.md    → id <parent>/<subdir>/<page>
README.md                      → id README

# docs_root = "<docs-root>"
<docs-root>/<parent>/<page>.md          → id <parent>/<page>
<docs-root>/<parent>/<subdir>/<page>.md → id <parent>/<subdir>/<page>
```

The two hierarchies, compared:

|                    | Folders                                             | Chunk parents / children                                                          |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| What it is         | The corpus repo's directory tree                    | The split of one page's `body`                                                    |
| What it decides    | A page's `source_path` and `id`                     | Children = units to search; parents = text sent to the LLM                        |
| Where it is stored | The repo; each `kb_pages` row records its file path | `kb_parents` / `kb_children`                                                      |
| Folder depth       | Unlimited nesting                                   | Not used — the split comes from the text ([03.1-chunkify.md](./03.1-chunkify.md)) |

Two files must not map to the same path (case-sensitive as git stores them). Prefer lowercase path segments so case-insensitive file systems do not collide.

## Identity

A page's identity is its **path** within its knowledge base.

| Field         | How it is set                                                                                |
| ------------- | -------------------------------------------------------------------------------------------- |
| `source_path` | POSIX path relative to docs root, including `.md` (example: `<parent>/<page>.md`)            |
| `kb_pages.id` | `source_path` without the `.md` suffix (`<parent>/<page>`); unique within the knowledge base |

`title` / `tags` come from frontmatter during ingest ([02-ingest.md](./02-ingest.md#frontmatter)). A rename or move is **delete old path + insert new path** (the hash skip does not carry embeddings across paths).
