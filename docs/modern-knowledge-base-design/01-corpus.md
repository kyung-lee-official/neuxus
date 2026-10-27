# Corpus source

**Does**

- Keep a local checkout of the chosen branch (clone / pull) from the per-knowledge-base git remote, recording the commit held (`last_synced_sha`)
- Define the corpus source layout: file include/exclude and the `id` identity (a file's repo-root-relative path minus `.md`, e.g. `guide/install.md` gives `id` `guide/install`)

**Never touches** — the page, image, parent, and child tables (`kb_pages`, `kb_image_descriptions`, `kb_parents`, `kb_children`); it writes only the checkout and `kb_corpus_settings.last_synced_sha`.

## Source

The markdown corpus lives in its **own git repository**, separate from the app; authors write and review it there and the app only reads it — you change markdown in git, not the app. A corpus backs a **read-only** knowledge base ([appendix A](./appendix-a-data-model.md)); a local directory that matches this layout is also valid.

Where a knowledge base reads from — the git remote and branch — is stored per knowledge base in `kb_corpus_settings`, not environment variables (nullable columns, app defaults in code; a null `repo_url` means no repository). `DATABASE_URL` stays an environment variable so the app can reach the database.

The corpus is materialized into a local checkout before anything reads it:

- **clone** — when the checkout is missing, from `repo_url` + `branch`.
- **pull** — when it exists, fetch and fast-forward to the branch tip.

`last_synced_sha` records the commit the checkout holds after a successful clone or pull. Changing `repo_url` / `branch` selects a different source; the layout rules below are unchanged.

## Repo layout

The whole checkout is the corpus; every included `*.md` becomes a page:

```text
corpus/
  README.md                   # included (id `README`)
  <parent>/
    <page>.md                 # included (id `<parent>/<page>`)
    <page>.meta.yaml          # sidecar read with the page (not a page)
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

A page may have a sibling sidecar `<page>.meta.yaml` in the same directory. The walker reads it alongside the page, but it is **not** a page (no `id`); its format is the image contract ([03.2-image-descriptions.md](./03.2-image-descriptions.md)).

## Hierarchy

Folders organize the corpus repo and set each page's `id`; one file is one page at any folder depth.

```text
<parent>/<page>.md             maps to id <parent>/<page>
<parent>/<subdir>/<page>.md    maps to id <parent>/<subdir>/<page>
README.md                      maps to id README
```

Two files must not map to the same path (case-sensitive as git stores them). Prefer lowercase path segments so case-insensitive file systems do not collide.

## Identity

A page's identity is its `id`: the file's repo-root-relative POSIX path without the `.md` suffix (e.g. `guide/install.md` gives `id` `guide/install`), unique within the knowledge base. A rename or move changes the `id` — a new identity, not an edit of the old one.
