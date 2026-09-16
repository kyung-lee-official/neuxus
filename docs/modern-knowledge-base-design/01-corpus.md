# Corpus (checkout → files)

How a **markdown git tree** becomes the set of files ingest will read.

This doc is the **corpus layout contract**: docs root, include/exclude, path → `source_path`, hierarchy, and what a sync must do at a SHA.

Folder depth is **authoring**. It is not chunk parent/child ([03.1-chunkify.md](./03.1-chunkify.md)).

## Source of truth

The markdown corpus lives in its **own git repository**, separate from the app. Authors write and review it there. The app only reads a chosen commit and shows the pages it imported; it never edits content — you change markdown in git, not the app.

A local directory that matches this layout is a valid checkout.

## Settings in the database

Where the app reads the corpus from — the git repository URL, the branch, and an optional docs-root subfolder — is stored in Postgres (`kb_corpus_settings`), not in environment variables. The row also records the last synced SHA. `DATABASE_URL` stays an environment variable so the app can reach the database.

Same shape as other knobs: single row `id = 'default'`, **nullable columns**, **app defaults in code** when missing.

`repo_url` has **no** useful app default. Null / missing means the repository is not configured: do not clone. Local CLI may still walk a folder the operator already checked out. Do not log credentials if a later column is added for private repositories.

Changing `repo_url` / `branch` does not rewrite `kb_pages`. The next sync at a SHA applies this contract (including deletes).

## Docs root

After clone/pull, only this tree is ingested:

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
| Docs root       | empty → walk the cloned repo root (default)                      |
| Docs root       | non-empty relative path → walk that subdirectory                 |
| Missing path    | fail the sync (only when an explicit non-empty docs root is set) |
| Path separators | POSIX `/` in stored `source_path`, even on Windows              |

The `docs_root` column on `kb_corpus_settings` overrides the empty default. `null` and `""` both mean "walk the repo root". A non-empty value (e.g. `docs`, `content`) restricts the walk to that subdirectory.

## Include and exclude

Walk **recursively** under the docs root.

| Include                                | Exclude                                         |
| -------------------------------------- | ----------------------------------------------- |
| Regular files whose name ends in `.md` | Any path with a component that starts with `.`  |
| UTF-8 text                             | Symlinks that resolve **outside** the docs root |
| Nested directories, any depth          | Non-`.md` files (images, assets — out of scope) |

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

|                    | Folders                                            | Chunk parents / children                                       |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------- |
| What it is         | The corpus repo's directory tree                    | The split of one page's `body`                                 |
| What it decides    | A page's `source_path` and `id`                     | Children = units to search; parents = text sent to the LLM      |
| Where it is stored | The repo; each `kb_pages` row records its file path | `kb_parents` / `kb_children`                                   |
| Folder depth       | Unlimited nesting                                   | Not used — the split comes from the text ([03.1-chunkify.md](./03.1-chunkify.md)) |

Two files must not map to the same path (case-sensitive as git stores them). Prefer lowercase path segments so Windows checkouts do not collide.

## Identity

v1 identity is the **path**, not frontmatter.

| Field         | How it is set                                                                     |
| ------------- | --------------------------------------------------------------------------------- |
| `source_path` | POSIX path relative to docs root, including `.md` (example: `<parent>/<page>.md`) |
| `kb_pages.id` | `source_path` without the `.md` suffix (`<parent>/<page>`)                        |

`title` / `tags` / `type` still come from frontmatter inside ingest ([02-ingest.md](./02-ingest.md#frontmatter)). This contract does **not** add `id:` yet. A rename or move is **delete old path + insert new path** (hash skip will not carry embeddings across paths).

Reserved for a later revision: optional frontmatter `id` as stable `kb_pages.id` so moves keep the row. Until ingest parses it, do not emit it.

## Sync at a SHA

A sync is pinned to a **git commit SHA** of the kb repo (not “whatever is on main later”).

```text
1. Checkout that SHA
2. List included paths under the docs root
3. For each file: ingest → persist (`content_hash` skip) → chunkify if replaced → embed stale children
4. Delete `kb_pages` whose `source_path` is under this corpus and **missing** from the list
```

Hash skip and replace-tree: [02-ingest.md](./02-ingest.md#incremental-updates-page-hash).

Deletes are part of this contract. A UI paste path that cannot name missing files is not a complete sync.

Idempotent: the same SHA with unchanged files is all skips (unless embed settings made children stale).

The application exposes an API for sync.

## Out of scope

- Authoring UX in the consumer
- Binary assets and markdown image rewrite
- Multiple corpora / multiple docs roots
- Branch previews (sync `main` / the configured default branch only, until a later revision)
- Mapping folder names onto `type` or `tags` (frontmatter only)
