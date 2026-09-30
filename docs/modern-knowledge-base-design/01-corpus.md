# Corpus layout

**Does**

- Keep a local checkout of the chosen branch (clone / pull / fetch)
- Define the corpus source layout: file include/exclude and the `id` identity (a file's repo-root-relative path minus `.md`, e.g. `guide/install.md` gives `id` `guide/install`)

Folder depth is an **authoring** choice: how authors organize the repo. It is not the chunk parent/child tree ([03.1-chunkify.md](./03.1-chunkify.md)).

## Source of truth

The markdown corpus lives in its **own git repository**, separate from the app. Authors write and review it there. The app only reads the chosen branch; it never edits the corpus — you change markdown in git, not the app. A corpus backs a **read-only** knowledge base ([appendix A](./appendix-a-data-model.md)).

A local directory that matches this layout is valid.

## Settings in the database

Where a knowledge base reads its corpus from — the git repository URL and the branch — is stored in Postgres (`kb_corpus_settings`), not in environment variables. The row also records the last commit read. `DATABASE_URL` stays an environment variable so the app can reach the database.

One row per knowledge base, keyed by `knowledge_base_id`; **nullable columns**, **app defaults in code** when missing.

`repo_url` has **no** useful app default. Null / missing means no repository is configured.

Changing `repo_url` / `branch` selects a different source; the layout rules below are unchanged.

## Checkout

The corpus is materialized into a local checkout before anything reads it:

- **clone** — when the checkout is missing, from `repo_url` + `branch`.
- **pull** — when it exists, fetch and fast-forward to the branch tip.

`last_synced_sha` records the commit the checkout holds after a successful sync. No `repo_url` means no clone.

## Repo layout

The whole checkout is the corpus; every included `*.md` becomes a page:

```text
kb.git/
  README.md                   # included (id `README`)
  <parent>/
    <page>.md                 # included (id `<parent>/<page>`)
    <subdir>/
      <page>.md               # included (id `<parent>/<subdir>/<page>`)
  CHANGELOG.md                # included
  .github/                    # excluded (dot segment)
```

| Rule            | Behavior                                    |
| --------------- | ------------------------------------------- |
| Walk            | the checkout root, recursively              |
| Path separators | POSIX `/` in the page `id`, even on Windows |

## Include and exclude

Walk **recursively** from the checkout root.

| Include                                | Exclude                                        |
| -------------------------------------- | ---------------------------------------------- |
| Regular files whose name ends in `.md` | Any path with a component that starts with `.` |
| UTF-8 text                             | Symlinks that resolve **outside** the checkout |
| Nested directories, any depth          | Non-`.md` files (not pages)                    |

`README.md` at the root **is** included (`id` `README`). Empty files are included too.

## Hierarchy

Folders organize the corpus repo and set each page's `id`; one file is one page at any folder depth.

```text
<parent>/<page>.md             maps to id <parent>/<page>
<parent>/<subdir>/<page>.md    maps to id <parent>/<subdir>/<page>
README.md                      maps to id README
```

Two files must not map to the same path (case-sensitive as git stores them). Prefer lowercase path segments so case-insensitive file systems do not collide.

## Identity

A page's identity is its `id`.

| Field | How it is set                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------- |
| `id`  | The file's repo-root-relative POSIX path without the `.md` suffix (`<parent>/<page>`); unique per KB |

A rename or move changes the `id`, so it is a new identity, not an edit of the old one.
