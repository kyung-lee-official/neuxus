# Corpus (checkout → files)

How a **markdown git tree** becomes the set of files ingest will read. One file → page columns is [02-ingest.md](./02-ingest.md). Then: [03-chunkify.md](./03-chunkify.md), [04-embed.md](./04-embed.md). Read path: [05-query.md](./05-query.md), [06-synthesis.md](./06-synthesis.md). Schema: [appendix-a-data-model.md](./appendix-a-data-model.md).

```text
kb.git @ SHA → docs root → *.md paths → ingestMarkdown(file) → persist / skip / delete
```

This doc is the **corpus layout contract**: docs root, include/exclude, path → `slug` / `source_path`, hierarchy, and what a sync must do at a SHA. GitHub Actions, webhooks, HTTP, and the local CLI are **callers**. They must not invent a second layout.

Folder depth is **authoring**. It is not chunk parent/child ([03-chunkify.md](./03-chunkify.md)).

## Source of truth

Canonical corpus is an **independent git repository** of markdown (separate from the consumer application). Authors edit and review there. The consumer reads a commit and inspects stored pages; it does not replace git as the editor.

A local directory that matches this layout is a valid checkout. Same walker as CI.

## Settings in the database

How to **reach** the corpus (git remote, branch, optional docs-root override, last synced SHA) lives in Postgres (`kb_corpus_settings`), not in env. `DATABASE_URL` remains process env so the app can reach the database.

Same shape as other knobs: single row `id = 'default'`, **nullable columns**, **app defaults in code** when missing. Schema: [appendix-a-data-model.md](./appendix-a-data-model.md#corpus-settings-table).

`repo_url` has **no** useful app default. Null / missing means the remote is not configured: do not clone. Local CLI may still walk a folder the operator already checked out. Do not log credentials if a later column is added for private remotes.

Changing `repo_url` / `branch` does not rewrite `kb_pages`. The next sync at a SHA applies this contract (including deletes).

## Docs root

After clone/pull, only this tree is ingested:

```text
kb.git/                       # docs root = repo root (default)
  README.md                   # ingested (slug `README`)
  <parent>/
    <page>.md                 # ingested (slug `<parent>/<page>`)
    <subdir>/
      <page>.md               # ingested (slug `<parent>/<subdir>/<page>`)
  CHANGELOG.md                # ingested
  .github/                    # not ingested (dot segment)
```

| Rule            | Behavior                                                         |
| --------------- | ---------------------------------------------------------------- |
| Docs root       | empty → walk the cloned repo root (default)                      |
| Docs root       | non-empty relative path → walk that subdirectory                 |
| Missing path    | fail the sync (only when an explicit non-empty docs root is set) |
| Path separators | POSIX `/` in stored `source_path` and `slug`, even on Windows    |

The `docs_root` column on `kb_corpus_settings` overrides the empty default. `null` and `""` both mean "walk the repo root". A non-empty value (e.g. `docs`, `content`) restricts the walk to that subdirectory.

## Include and exclude

Walk **recursively** under the docs root.

| Include                                | Exclude                                         |
| -------------------------------------- | ----------------------------------------------- |
| Regular files whose name ends in `.md` | Any path with a component that starts with `.`  |
| UTF-8 text                             | Symlinks that resolve **outside** the docs root |
| Nested directories, any depth          | Non-`.md` files (images, assets — out of scope) |

No `_index.md` convention in this prototype. `<docs-root>/README.md` **is** ingested (`slug` `README`) unless you later add an exclude. Empty files still go through ingest (empty `body` after normalize is allowed).

## Hierarchy

Nested folders group pages for humans and for **slug prefixes**. `kb_pages` stays **flat**: one row per file, unique `slug` ([appendix-a](./appendix-a-data-model.md)).

```text
# docs_root = "" (default)
<parent>/<page>.md             → slug <parent>/<page>
<parent>/<subdir>/<page>.md    → slug <parent>/<subdir>/<page>
README.md                      → slug README

# docs_root = "<docs-root>"
<docs-root>/<parent>/<page>.md          → slug <parent>/<page>
<docs-root>/<parent>/<subdir>/<page>.md → slug <parent>/<subdir>/<page>
```

|           | Folders               | Chunk parents / children                            |
| --------- | --------------------- | --------------------------------------------------- |
| Meaning   | Site tree / slug      | Retrieval vs LLM spans inside **one** `body`        |
| Stored as | `slug`, `source_path` | `kb_parents` / `kb_children`                        |
| Depth     | Unlimited             | Independent; see [03-chunkify.md](./03-chunkify.md) |

Do **not** treat “layer 1 folder” as parent chunks. Do not invent a layer type system.

Two files must not map to the same slug (case-sensitive as git stores them). Prefer lowercase path segments so Windows checkouts do not collide.

## Identity

v1 identity is the **path**, not frontmatter.

| Field         | How it is set                                                                     |
| ------------- | --------------------------------------------------------------------------------- |
| `source_path` | POSIX path relative to docs root, including `.md` (example: `<parent>/<page>.md`) |
| `slug`        | `source_path` without the `.md` suffix (`<parent>/<page>`)                        |
| `kb_pages.id` | Same as `slug`                                                                    |

`title` / `tags` / `type` still come from frontmatter inside ingest ([02-ingest.md](./02-ingest.md#frontmatter)). This contract does **not** add `id:` yet. A rename or move is **delete old path + insert new path** (hash skip will not carry embeddings across paths).

Reserved for a later revision: optional frontmatter `id` as stable `kb_pages.id` so moves keep the row. Until ingest parses it, do not emit it.

## Sync at a SHA

Callers pin a **git commit SHA** of the kb repo (not “whatever is on main later”).

```text
1. Checkout that SHA
2. List included paths under the docs root
3. For each file: ingest → persist (`content_hash` skip) → chunkify if replaced → embed stale children
4. Delete `kb_pages` whose `source_path` is under this corpus and **missing** from the list
```

Hash skip and replace-tree: [02-ingest.md](./02-ingest.md#incremental-updates-page-hash). Embed: [04-embed.md](./04-embed.md).

Deletes are part of this contract. A UI paste path that cannot name missing files is not a complete sync.

Idempotent: the same SHA with unchanged files is all skips (unless embed settings made children stale).

## Callers (not this contract)

| Caller                               | Role                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| Local CLI / folder                   | Same walker on a checkout (dev)                                       |
| Application admin Sync               | `POST <api-root>/corpus/sync` (or equivalent) in the consumer process |
| GitHub Action on push to the kb repo | Checkout SHA, run walker or `POST` a sync job                         |
| Push webhook                         | Only acceptable if it still checks out that SHA and uses this walker  |

Do not send file bodies in the GitHub `push` payload. Do not keep a second include/exclude list in CI YAML.

Retry, locking, and “one sync at a time” are application layer.

## Out of scope

- Authoring UX in the consumer
- Binary assets and markdown image rewrite
- Multiple corpora / multiple docs roots
- Branch previews (sync `main` / the configured default branch only, until a later revision)
- Mapping folder names onto `type` or `tags` (frontmatter only)
