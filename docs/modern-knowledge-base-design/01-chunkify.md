# Chunkify strategy (parent–child + structure-first)

**Parents** = generation context. **Children** = retrieval units (embedded). Structure decides parents; size only refines children and oversized parents. Do not slice the whole file every N characters as the first step.

Related: [appendix-a-data-model.md](./appendix-a-data-model.md) (tables / Prisma), [appendix-b-vector-search.md](./appendix-b-vector-search.md) (query-time search).

## Why parent–child

| Classic RAG  | Problem                             |
| ------------ | ----------------------------------- |
| Small chunks | Precise retrieval, thin LLM context |
| Large chunks | Better context, blurry embeddings   |

| Role                           | Purpose                       | Embedded? |
| ------------------------------ | ----------------------------- | --------- |
| **Child** (~300–450 tokens)    | Search / match                | Yes       |
| **Parent** (~1000–1600 tokens) | LLM context when a child hits | No        |

Child size is limited mainly by **embedding precision**. Parent size is limited by **useful context** (+ remaining LLM budget). The model context window is secondary.

## How parent and child connect

One markdown **page** owns many **parents**; each parent owns many **children**. The link is many-to-one: every child points at exactly one parent; parents never embed, children never go to the LLM.

```text
page (slug, title, body)
  └── parent  (section / size-capped slice of body)
        ├── child  → embedding   (search hit)
        ├── child  → embedding
        └── …
```

**Identity and lookup**

| Link             | Meaning                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `child → parent` | Required foreign key (or stable parent key). A search hit resolves context by loading this parent’s text.              |
| `parent → page`  | Parent belongs to one page (`slug` / page id) for citation and title.                                                  |
| Offsets          | Optional `start` / `end` in `body` so parent/child text can be re-sliced or debugged without storing divergent copies. |

**Invariants**

- Children are built **only inside** their parent’s span; no child crosses a parent boundary.
- Sibling overlap (when used) stays within that parent.
- On page edit: replace that page’s parents and children together, then re-embed children (no orphan vectors from an old layout).
- At query time: rank **children** → collect unique **parents** → budget → send parent text (+ page title / slug) to the LLM.

## How we build chunks

**Input:** page `body` only (YAML/TOML frontmatter stripped before tokenization). Chunking never sees frontmatter.

**Pipeline (fixed order):**

1. Normalize newlines (`\r\n` / `\r` → `\n`); do not alter fence interiors beyond this.
2. Lex `body` into an ordered list of **blocks** (see [Atomic blocks](#atomic-blocks-and-edge-cases)).
3. Build **parents** from blocks using structure-first rules (below).
4. Inside each parent, pack contiguous blocks into **children**.

Parent and child packing operate on **whole blocks only**. A block is never cut mid-content except where this doc explicitly allows a **forced prose split** (plain paragraphs only).

### Parents (structure-first)

1. Prefer one parent per `##` section: heading block + following blocks until the next `##` (or EOF). A leading `#` title (if present in `body`) belongs to the first parent with the following prose until the first `##`, or alone with the rest of the body when there is no `##`.
2. No `##` → whole body is one parent (typical short notes).
3. If a section still exceeds `parentMax` (~1000–1600 tokens): split on `###` boundaries first; if still over, pack consecutive blocks into sub-parents ≤ `parentMax` without breaking atomic blocks.
4. Never start a new parent in the middle of an atomic block. Never orphan a **glue group** (see below) across a parent boundary.

### Children (inside each parent only)

1. Walk the parent’s blocks in order; pack into children targeting **~300–450 tokens** (soft).
2. Hard max **~500 tokens** applies only to packs of **splittable prose**. Atomic blocks and glue groups may exceed the hard max as a single child (see [Oversized atomic blocks](#oversized-atomic-blocks)).
3. Overlap **~40–80 tokens** only after a **forced prose split** (plain paragraph cut). Never overlap by duplicating fence or image-desc content.
4. Merge crumbs under ~50–80 tokens into the previous child when that merge stays ≤ hard max (or the previous child is already an oversized atomic exception).
5. Persist each child with `parent_id` (and page / offsets as needed). Offsets must cover the exact `body` span of the packed blocks.

### Degenerate cases

| Page                    | Parents                            | Children             |
| ----------------------- | ---------------------------------- | -------------------- |
| Short body ≤ parent max | 1 = full body                      | Often 1 (or a few)   |
| Normal `##` doc         | 1 per `##`                         | Several per parent   |
| Huge `##`               | Sub-parents via `###` / paragraphs | Children inside each |

## Atomic blocks and edge cases

The chunkifier is **deterministic**: same `body` bytes (after newline normalization) always yield the same parent/child spans. Edge cases are resolved by classifying every region of the body as exactly one block type before packing.

### Block inventory

Lex top-level CommonMark-ish blocks in document order. Fenced regions and image-desc regions win over paragraph rules (a line inside a fence is not a heading or list).

| Block type         | How it is recognized                                                               | Atomic?          | Notes                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ATX heading        | Line matching `#{1,6} ` at line start (optional trailing `#`)                      | Yes              | Stays with following content via parent rules; never merged into previous child’s prose mid-pack across a new `##` parent boundary |
| Fenced code        | Opening fence through matching close (see [Code fences](#code-fences))             | Yes              | Language tag and info string stay on the opening line                                                                              |
| Image + desc group | Image line(s) + optional alt/title + `<!-- image-desc -->` region (see below)      | Yes (glue group) | One retrieval/generation unit                                                                                                      |
| Indented code      | Runs of lines with ≥4 leading spaces / 1 tab, CommonMark-style                     | Yes              | Prefer fences in authored docs; still atomic if present                                                                            |
| List               | Contiguous list items (tight or loose) until a blank line that ends the list       | Yes              | Nested lists stay inside the same list block                                                                                       |
| Table              | GFM table: header row + delimiter row + body rows                                  | Yes              |                                                                                                                                    |
| Blockquote         | Contiguous `>` lines (may contain nested structure treated as opaque text in v1)   | Yes              |                                                                                                                                    |
| Thematic break     | `---`, `***`, or `___` line alone                                                  | Yes              | Soft parent hint only; does not alone force a parent split                                                                         |
| HTML block         | HTML block per CommonMark (excluding image-desc comments, which are handled above) | Yes              |                                                                                                                                    |
| Paragraph          | One or more non-blank lines not classified above                                   | No (splittable)  | Only type that may be force-split when over hard max                                                                               |
| Blank run          | One or more `\n` between blocks                                                    | —                | Separators only; not stored as their own child                                                                                     |

**Glue group:** two or more adjacent blocks that must stay in the same parent and the same child. Today that means **image + image-desc** (and the image’s immediate caption paragraph if it sits between them with no blank line). Treat the group as one atomic unit for packing.

### Code fences

**Open / close**

- Opening line: optional indent ≤3 spaces, then a fence marker of **three or more** backticks or tildes, optional info string (language + rest of line).
- Closing line: optional indent ≤3 spaces, **same** fence character as the opener, at least as many repeats as the opener, and no info string.
- The fence block is everything from the opening line through the closing line **inclusive**.

**Rules**

| Situation                                      | Behavior                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal paired fence                            | One atomic block. Never split inside; never attach half a fence to the previous/next child.                                                                                                                               |
| Fence longer than `childHardMax` / `parentMax` | Still one atomic block. Becomes its own child (and its own parent if it alone exceeds `parentMax` after structure splits). Do **not** slice code to satisfy size knobs.                                                   |
| Unclosed fence (EOF before close)              | From opener through EOF is one atomic fence block. Do not reinterpret interior lines as headings/lists.                                                                                                                   |
| Fence inside a list item                       | In v1, if the lexer is top-level only: prefer authors use fences outside lists. If a fence is detected at top level, it still closes only on a valid closing fence line — list markers inside the fence are literal text. |
| Apparent “nested” fences                       | CommonMark does not nest fences: the first matching closer ends the fence. An info string may contain fence characters; a closer must be a line of only the fence character (plus optional indent).                       |
| Backtick vs tilde                              | Opener character chooses the fence family; a backtick line does not close a tilde fence and vice versa.                                                                                                                   |

**Packing with neighbors**

- A short paragraph that only introduces the fence (“Example:”) **should** pack into the same child as the fence when the combined size ≤ soft target; if packing would exceed hard max, keep the intro paragraph in the previous child only when it is not part of a glue group — prefer packing intro + fence together and allowing soft-target overrun up to hard max; if intro + fence still exceed hard max, keep them together anyway when the intro is ≤ ~40 tokens (treat as glue-to-fence). Otherwise the fence stands alone as its own child and the intro stays with prior prose.
- Never put the fence in child _N_ and its closing line in child _N+1_.

### Image descriptions

**Canonical form** (authors and ingest must normalize to this):

```markdown
![Alt text](path-or-url "optional title")

<!-- image-desc -->

Plain-text (or markdown) description of what the image shows.
May span multiple lines.

<!-- /image-desc -->
```

**Recognition**

1. An image leaf: markdown image (`![…](…)`) or HTML `<img …>` on its own paragraph.
2. Optional blank line.
3. Opening marker line: exactly `<!-- image-desc -->` (trim surrounding whitespace on that line only).
4. Body lines until closing marker line: exactly `<!-- /image-desc -->`.
5. Missing closer → description body runs through the next atomic boundary (next heading, fence opener, or EOF); still glue to the image.

**Rules**

| Situation                    | Behavior                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Image + desc present         | One **glue group** (image paragraph + desc region). Same parent, same child.                                   |
| Image without desc           | Image paragraph is a normal atomic HTML/paragraph-like block (treat as atomic media block); no desc required.  |
| Desc without preceding image | Treat as an HTML/comment atomic block alone (do not invent an image). Prefer linting this away at author time. |
| Desc larger than hard max    | Keep glue group intact; allow oversized child (same exception as fences).                                      |
| Markers inside a code fence  | Literal text inside the fence; **not** an image-desc region.                                                   |
| Extra HTML comments          | Ordinary HTML / ignored for glue unless they match the exact markers above.                                    |

**Parent split:** never place the image in one parent and its `image-desc` in the next. If a size-based parent pack would separate them, move the whole glue group into the next parent (or keep the group in the previous parent and start the new parent after the group).

### Lists, tables, quotes

| Construct                              | Edge rule                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loose list (blank lines between items) | Still **one** list block until the list ends; blank lines inside do not create paragraph children mid-list.                                                                                                                                |
| List item longer than hard max         | Keep whole list atomic in v1 (same oversized exception). Optional later: split between top-level items only if each item is a separate list block by blank-line separation **and** authors use separate lists — do not half-split an item. |
| Table                                  | Atomic; oversized table → oversized child/parent exception.                                                                                                                                                                                |
| Blockquote                             | Atomic in v1 (opaque).                                                                                                                                                                                                                     |

### Forced prose splits (paragraphs only)

When packing children and a **single paragraph** block exceeds `childHardMax`:

1. Split on sentence boundaries (`. `, `? `, `! `) preferring chunks in the soft target range.
2. If a single sentence still exceeds hard max, split on whitespace nearest the target size.
3. Apply overlap **only** between the two resulting prose pieces (~40–80 tokens from the end of the previous piece), still within the same parent.
4. Never apply this procedure inside fences, tables, lists, image-desc bodies, or headings.

### Oversized atomic blocks

Size knobs are **soft constraints** for prose packing. Atomic blocks and glue groups always win.

| Case                               | Parent                          | Child                                      |
| ---------------------------------- | ------------------------------- | ------------------------------------------ |
| Atomic ≤ parentMax, > childHardMax | Stays in current section parent | Alone as one child (over hard max allowed) |
| Atomic > parentMax                 | That block alone is one parent  | One child (= full parent text)             |
| Glue group > parentMax             | Whole group is one parent       | One child                                  |

Record optional debug metadata later (e.g. `oversized: true`) if useful; v1 behavior does not drop or truncate these blocks.

### Heading and structure edge cases

| Situation                                    | Behavior                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#` only, no `##`                            | Single parent = full body                                                                                                                                           |
| Text starts with prose before first `##`     | First parent = preamble through the line before first `##`                                                                                                          |
| Empty `##` section (heading with no body)    | Parent may be heading-only; emit no children, or one child with just the heading text — prefer **one child** equal to the heading so the section remains searchable |
| `####` and deeper                            | Do not start parents; they remain blocks inside the current `##` / `###` parent pack                                                                                |
| Setext headings (`===` / `---` under a line) | v1: treat as paragraph + thematic break unless you explicitly lex Setext; prefer ATX in the corpus                                                                  |

### Empty and whitespace-only bodies

| Input                          | Result                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| Empty / whitespace-only `body` | No parents, no children; page row may still exist with hash |
| Heading-only page              | One parent, one child (heading text)                        |

## Query path

```text
question → embed → search children only
        → expand to unique parents (via child → parent)
        → dedupe / merge overlapping parents
        → apply budget (max parents / max characters)
        → LLM sees parent texts (+ page title / slug)
```

Do not send children to the LLM. Short pages: one small parent ≈ full body.

## Defaults (tech markdown)

| Knob                    | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Child target / hard max | 300–450 / ~500 tokens (prose packs only)                      |
| Child overlap           | 40–80 tokens (forced **prose** splits only)                   |
| Parent target / max     | 1000–1600 tokens                                              |
| Parent boundaries       | `##` → `###` → block packs                                    |
| Atomic override         | Fences, glue groups, tables, lists may exceed max as one unit |
| Embed                   | Children only (optional `Title: …` prefix)                    |
| LLM context             | Deduped parents under a character budget                      |

## Incremental updates (page hash)

The skip gate is the **markdown page**, not each child. Store `pages.content_hash` over stable fields (normalize newlines first), for example:

`sha256(title + type + tags + body)`

| Situation                                   | Action                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Hash matches stored page                    | Skip — no re-chunk, no re-embed                                   |
| Hash differs                                | Replace that page’s parents and children, then embed new children |
| Markdown unchanged, embedding model changed | Re-embed children whose `embedding_model` (or signature) is stale |

Do not rely on per-child file hashes as the primary gate: you would still parse every file to know what changed. Optional child/parent text hashes are fine later for debugging; v1 replace-on-page-change is enough.

Ingest should share one code path with any higher-layer rebuild tools: hash check → optional replace tree → embed children → update `content_hash` / `embedding_model`. Operator-facing APIs (compare hashes, force re-chunk, re-embed stale) live outside this doc.

See also [appendix-a-data-model.md](./appendix-a-data-model.md) (tables / Prisma) and [appendix-b-vector-search.md](./appendix-b-vector-search.md) (query-time search).

## One-line rule

**Parents = markdown sections (size-capped); children = small packs inside a parent for search; atomic blocks (fences, image-desc glue, tables, lists) never split; LLM gets parents via the child → parent link.**
