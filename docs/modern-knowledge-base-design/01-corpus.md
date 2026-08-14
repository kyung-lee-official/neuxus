# Corpus (checkout → files)

How a **markdown git tree** becomes the set of files ingest will read. One file → page columns is [02-ingest.md](./02-ingest.md). Then: [03-chunkify.md](./03-chunkify.md), [04-embed.md](./04-embed.md). Read path: [05-query.md](./05-query.md), [06-synthesis.md](./06-synthesis.md). Schema: [appendix-a-data-model.md](./appendix-a-data-model.md).

```text
kb.git @ SHA → docs root → *.md paths → ingestMarkdown(file) → persist / skip / delete
```

This doc is the **corpus layout contract**: docs root, include/exclude, path → `slug` / `source_path`, hierarchy, and what a sync must do at a SHA. GitHub Actions, webhooks, HTTP, and the local CLI are **callers**. They must not invent a second layout.

Folder depth is **authoring**. It is not chunk parent/child ([03-chunkify.md](./03-chunkify.md)).

## Source of truth

Canonical corpus is an **independent git repository** of markdown (not the neuxus app repo). Authors edit and review there. neuxus **consumes** a commit; `/knowledge-base` inspects stored pages. It does not replace git as the editor.

A local directory that matches this layout is a valid checkout. Same walker as CI.

## Settings in the database

How to **reach** the corpus (git remote, branch, optional docs-root override, last synced SHA) lives in Postgres (`kb_corpus_settings`), not in env. `DATABASE_URL` remains process env so the app can reach the database.

Same shape as other knobs: single row `id = 'default'`, **nullable columns**, **app defaults in code** when missing. Schema: [appendix-a-data-model.md](./appendix-a-data-model.md#corpus-settings-table).

`repo_url` has **no** useful app default. Null / missing means the remote is not configured: do not clone. Local CLI may still walk a folder the operator already checked out. Do not log credentials if a later column is added for private remotes.

Changing `repo_url` / `branch` does not rewrite `kb_pages`. The next sync at a SHA applies this contract (including deletes).

## Docs root

After clone/pull, only this tree is ingested:

```text
kb.git/
  docs/                 # docs root (required)
    guide/
      install.md
      install/windows.md
  README.md             # not ingested (outside docs root)
  .github/              # not ingested
```

| Rule            | Prototype default                                             |
| --------------- | ------------------------------------------------------------- |
| Docs root       | `docs/` at the repo root                                      |
| Missing `docs/` | Fail the sync; do not walk `.`                                |
| Path separators | POSIX `/` in stored `source_path` and `slug`, even on Windows |

Later a nullable `docs_root` column on `kb_corpus_settings` may override this directory name (app default still `docs`). Until a non-null override exists, `docs/` is the contract.

## Include and exclude

Walk **recursively** under the docs root.

| Include                                | Exclude                                         |
| -------------------------------------- | ----------------------------------------------- |
| Regular files whose name ends in `.md` | Any path with a component that starts with `.`  |
| UTF-8 text                             | Symlinks that resolve **outside** the docs root |
| Nested directories, any depth          | Non-`.md` files (images, assets — out of scope) |

No `_index.md` convention in this prototype. `docs/README.md` **is** ingested (`slug` `README`) unless you later add an exclude. Empty files still go through ingest (empty `body` after normalize is allowed).

## Hierarchy

Nested folders group pages for humans and for **slug prefixes**. `kb_pages` stays **flat**: one row per file, unique `slug` ([appendix-a](./appendix-a-data-model.md)).

```text
docs/guide/install.md           → slug guide/install
docs/guide/install/windows.md   → slug guide/install/windows
```

|           | Folders                                       | Chunk parents / children                            |
| --------- | --------------------------------------------- | --------------------------------------------------- |
| Meaning   | Site tree / slug                              | Retrieval vs LLM spans inside **one** `body`        |
| Stored as | `slug`, `source_path`                         | `kb_parents` / `kb_children`                        |
| Depth     | Unlimited (prefer ≤ 4 segments after `docs/`) | Independent; see [03-chunkify.md](./03-chunkify.md) |

Do **not** treat “layer 1 folder” as parent chunks. Do not invent a layer type system.

Two files must not map to the same slug (case-sensitive as git stores them). Prefer lowercase path segments so Windows checkouts do not collide.

## Identity

v1 identity is the **path**, not frontmatter.

| Field         | How it is set                                                                   |
| ------------- | ------------------------------------------------------------------------------- |
| `source_path` | POSIX path relative to docs root, including `.md` (example: `guide/install.md`) |
| `slug`        | `source_path` without the `.md` suffix (`guide/install`)                        |
| `kb_pages.id` | Same as `slug`                                                                  |

`title` / `tags` / `type` still come from frontmatter inside ingest ([02-ingest.md](./02-ingest.md#frontmatter)). This contract does **not** add `id:` yet. A rename or move is **delete old path + insert new path** (hash skip will not carry embeddings across paths).

Reserved for a later revision: optional frontmatter `id` as stable `kb_pages.id` so moves keep the row. Until ingest parses it, do not emit it.

## Sync at a SHA

Callers pin a **git commit SHA** of the kb repo (not “whatever is on main later”).

```text
1. Checkout that SHA
2. List included paths under docs/
3. For each file: ingest → persist (`content_hash` skip) → chunkify if replaced → embed stale children
4. Delete `kb_pages` whose `source_path` is under this corpus and **missing** from the list
```

Hash skip and replace-tree: [02-ingest.md](./02-ingest.md#incremental-updates-page-hash). Embed: [04-embed.md](./04-embed.md).

Deletes are part of this contract. A UI paste path that cannot name missing files is not a complete sync.

Idempotent: the same SHA with unchanged files is all skips (unless embed settings made children stale).

## Callers (not this contract)

| Caller                               | Role                                                                 |
| ------------------------------------ | -------------------------------------------------------------------- |
| Local CLI / folder                   | Same walker on a checkout (dev)                                      |
| neuxus admin Sync                    | `POST /server-setting/corpus/sync` in the API process                |
| GitHub Action on push to the kb repo | Checkout SHA, run walker or `POST` a sync job                        |
| Push webhook                         | Only acceptable if it still checks out that SHA and uses this walker |

Do not send file bodies in the GitHub `push` payload. Do not keep a second include/exclude list in CI YAML.

Retry, locking, and “one sync at a time” are application layer.

## Out of scope

- Authoring UX in neuxus
- Binary assets and markdown image rewrite
- Multiple corpora / multiple docs roots
- Branch previews (sync `main` / the configured default branch only, until a later revision)
- Mapping folder names onto `type` or `tags` (frontmatter only)
