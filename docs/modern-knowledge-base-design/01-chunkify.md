# Chunkify strategy (parent–child + structure-first)

**Parents** = generation context. **Children** = retrieval units. Structure decides parents; size only refines children and oversized parents. Do not slice the whole file every N characters as the first step.

Related: [appendix-a-data-model.md](./appendix-a-data-model.md) (tables / Prisma), [appendix-b-vector-search.md](./appendix-b-vector-search.md) (query-time search).

## Pure function scope

The chunkifier is a **pure function**: markdown `body` in → parent/child spans out. No I/O.

```ts
chunkify(body: string, options?: ChunkifyOptions): {
  parents: { index: number; text: string; start: number; end: number }[];
  children: {
    parentIndex: number;
    index: number;
    text: string;
    start: number;
    end: number;
  }[];
}
```

| In scope                                                   | Out of scope                                      |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Newline normalize, lex, parent/child pack                  | Frontmatter strip (caller supplies `body` only)   |
| Token counts for packing decisions                         | Page `content_hash` / skip gate                   |
| Exact `text` slices + `start`/`end` into normalized `body` | Persisting rows; embedding; query / LLM synthesis |

Callers merge **knobs** from DB (if present) over **app-level defaults**, then pass the resolved numbers into `options`.

## Why parent–child

| Classic RAG  | Problem                             |
| ------------ | ----------------------------------- |
| Small chunks | Precise retrieval, thin LLM context |
| Large chunks | Better context, blurry embeddings   |

| Role                   | Purpose                       | Embedded? |
| ---------------------- | ----------------------------- | --------- |
| **Child** (see knobs)  | Search / match                | Yes       |
| **Parent** (see knobs) | LLM context when a child hits | No        |

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

| Link             | Meaning                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `child → parent` | Required FK (or parent index in the pure result). A search hit loads this parent’s text for generation. |
| `parent → page`  | Parent belongs to one page (`slug` / page id) for citation and title.                                   |
| Offsets          | `start` / `end` into normalized `body` so spans stay aligned with source text.                          |

**Invariants**

- Children are built **only inside** their parent’s span; no child crosses a parent boundary.
- Sibling overlap (when used) stays within that parent.
- On page change: replace that page’s parents and children together (no orphan vectors from an old layout).
- At query time: rank **children** → collect unique **parents** → budget → send parent text (+ page title / slug) to the LLM.

## Parser and token counting (decided)

| Concern          | Decision                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown dialect | GitHub Flavored Markdown (GFM)                                                                                                              |
| Parser           | Bun built-in **`Bun.markdown`** (GFM extensions on by default). Map parse/render events into the [block inventory](#block-inventory) below. |
| Token counting   | **`ai-tokenizer`** (`tokenizer.count(text)`). One encoding for all packing decisions (encoding id is a knob; see open questions).           |

`Bun.markdown` is a render-oriented API and may evolve (unstable). Chunkify still needs reliable **source offsets** into normalized `body` — see open questions if callbacks do not expose positions directly.

## Knobs (DB-adjustable, app defaults)

Size and packing knobs are **adjustable in the database** (see [appendix-a](./appendix-a-data-model.md)). Missing DB values fall back to **app-level defaults** (not SQL `DEFAULT`). Resolved knobs are passed into `chunkify` as `options`.

| Knob                      | App default                         | Role                                                         |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `childTargetTokens`       | `400`                               | Soft pack target for children                                |
| `childHardMaxTokens`      | `500`                               | Hard max for **splittable prose** packs only                 |
| `childOverlapTokens`      | `60`                                | Overlap after a forced prose split                           |
| `childCrumbMinTokens`     | `64`                                | Merge smaller crumbs into the previous child when allowed    |
| `parentMaxTokens`         | `1400`                              | Max parent size before `###` / block re-pack                 |
| `fenceIntroGlueMaxTokens` | `40`                                | Max size of a lead-in paragraph glued to the following fence |
| `tokenizerEncoding`       | _(open — pick with `ai-tokenizer`)_ | Encoding module used for `count`                             |

**Parent boundaries (fixed policy, not a numeric knob):** `##` → `###` → block packs. Atomic blocks (fences, glue groups, tables, lists, …) may exceed size knobs as one unit.

## How we build chunks

**Input:** page `body` only (YAML/TOML frontmatter already stripped by the caller). Chunking never sees frontmatter.

**Pipeline (fixed order):**

1. Normalize newlines (`\r\n` / `\r` → `\n`); do not alter fence interiors beyond this.
2. Lex `body` via **`Bun.markdown`** into an ordered list of **blocks** (see [Atomic blocks](#atomic-blocks-and-edge-cases)).
3. Build **parents** from blocks using structure-first rules (below).
4. Inside each parent, pack contiguous blocks into **children** using **`ai-tokenizer`** counts and resolved knobs.

Parent and child packing operate on **whole blocks only**. A block is never cut mid-content except where this doc explicitly allows a **forced prose split** (plain paragraphs only).

### Output text = exact body slices

Every parent/child `text` is `body.slice(start, end)` on the **newline-normalized** body (same string the offsets refer to). Keep intervening blank lines inside a span; do not compact or re-join blocks with a single `\n`.

Example — `body` contains two paragraphs separated by a blank line. One child covering both is:

```text
Alpha paragraph.

Beta paragraph.
```

not `Alpha paragraph.\nBeta paragraph.`.

### Parents (structure-first)

1. Prefer one parent per `##` section: heading block + following blocks until the next `##` (or EOF). A leading `#` title (if present in `body`) belongs to the first parent with the following prose until the first `##`, or with the rest of the body when there is no `##`.
2. No `##` → whole body is one parent (typical short notes).
3. If a section still exceeds `parentMaxTokens`: split on `###` boundaries first; if still over, pack consecutive blocks into sub-parents ≤ `parentMaxTokens` without breaking atomic blocks.
4. Never start a new parent in the middle of an atomic block. Never orphan a **glue group** across a parent boundary.

### Children (inside each parent only)

1. Walk the parent’s blocks in order; pack into children targeting `childTargetTokens` (soft).
2. `childHardMaxTokens` applies only to packs of **splittable prose**. Atomic blocks and glue groups may exceed it as a single child (see [Oversized atomic blocks](#oversized-atomic-blocks)).
3. Overlap `childOverlapTokens` only after a **forced prose split**. Never overlap by duplicating fence or image-desc content.
4. Merge crumbs under `childCrumbMinTokens` into the previous child when that merge stays ≤ hard max (or the previous child is already an oversized atomic exception).
5. Each child carries `parentIndex` and offsets covering the exact span of the packed blocks.

### Degenerate cases

| Page                           | Parents                            | Children             |
| ------------------------------ | ---------------------------------- | -------------------- |
| Short body ≤ `parentMaxTokens` | 1 = full body                      | Often 1 (or a few)   |
| Normal `##` doc                | 1 per `##`                         | Several per parent   |
| Huge `##`                      | Sub-parents via `###` / paragraphs | Children inside each |

## Atomic blocks and edge cases

The chunkifier is **deterministic**: same normalized `body` + same resolved knobs always yield the same parent/child spans. Edge cases are resolved by classifying every region of the body as exactly one block type before packing.

### Block inventory

Lex top-level GFM blocks in document order (via `Bun.markdown`). Fenced regions and image-desc regions win over paragraph rules (a line inside a fence is not a heading or list).

| Block type         | How it is recognized                                                          | Atomic?          | Notes                                                   |
| ------------------ | ----------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| ATX heading        | Line matching `#{1,6} ` at line start (optional trailing `#`)                 | Yes              | Stays with following content via parent rules           |
| Fenced code        | Opening fence through matching close (see [Code fences](#code-fences))        | Yes              | Language tag and info string stay on the opening line   |
| Image + desc group | Image line(s) + optional alt/title + `<!-- image-desc -->` region (see below) | Yes (glue group) | One retrieval/generation unit                           |
| Indented code      | Runs of lines with ≥4 leading spaces / 1 tab, CommonMark-style                | Yes              | Prefer fences in authored docs; still atomic if present |
| List               | Contiguous list items (tight or loose) until the list ends                    | Yes              | Nested lists stay inside the same list block            |
| Table              | GFM table: header row + delimiter row + body rows                             | Yes              |                                                         |
| Blockquote         | Contiguous `>` lines (nested structure opaque in v1)                          | Yes              |                                                         |
| Thematic break     | `---`, `***`, or `___` line alone                                             | Yes              | Does not alone force a parent split                     |
| HTML block         | HTML block per CommonMark (excluding image-desc markers, handled above)       | Yes              |                                                         |
| Paragraph          | One or more non-blank lines not classified above                              | No (splittable)  | Only type that may be force-split when over hard max    |
| Blank run          | One or more `\n` between blocks                                               | —                | Not its own child; preserved inside exact slices        |

**Glue group:** two or more adjacent blocks that must stay in the same parent and the same child. Today that means **image + image-desc** (and the image’s immediate caption paragraph if it sits between them with no blank line). Treat the group as one atomic unit for packing.

### Code fences

**Open / close**

- Opening line: optional indent ≤3 spaces, then a fence marker of **three or more** backticks or tildes, optional info string (language + rest of line).
- Closing line: optional indent ≤3 spaces, **same** fence character as the opener, at least as many repeats as the opener, and no info string.
- The fence block is everything from the opening line through the closing line **inclusive**.

**Rules**

| Situation                                                  | Behavior                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal paired fence                                        | One atomic block. Never split inside; never attach half a fence to the previous/next child.                                                                   |
| Fence longer than `childHardMaxTokens` / `parentMaxTokens` | Still one atomic block. Own child (and own parent if it alone exceeds `parentMaxTokens` after structure splits). Do **not** slice code to satisfy size knobs. |
| Unclosed fence (EOF before close)                          | From opener through EOF is one atomic fence block. Do not reinterpret interior lines as headings/lists.                                                       |
| Fence inside a list item                                   | Prefer fences outside lists in authored docs. List markers inside a fence are literal text.                                                                   |
| Apparent “nested” fences                                   | First matching closer ends the fence. Closer = line of only the fence character (plus optional indent).                                                       |
| Backtick vs tilde                                          | Opener character chooses the fence family.                                                                                                                    |

### Fence intro glue

A short paragraph that only introduces the following fence should stay in the **same child** as the fence when it is ≤ `fenceIntroGlueMaxTokens` (default `40`).

````markdown
## Examples

Here is the setup code:

```ts
export const x = 1;
```
````

“Here is the setup code:” is the fence intro. Glued child = intro paragraph + fence. Without glue, retrieval can hit the code without the sentence (or the reverse).

**Packing rule (v1):**

1. If the block immediately before a fence is a paragraph with token count ≤ `fenceIntroGlueMaxTokens`, treat **intro + fence** as a glue pair for child packing (same child; may exceed soft target; may exceed hard max only because the fence is atomic).
2. If the intro is larger than `fenceIntroGlueMaxTokens`, do not glue: intro packs with prior prose; fence is its own child (or packs with following material under normal rules).
3. Never put the fence in child _N_ and its closing line in child _N+1_.

### Image descriptions

**Canonical form** (authors should use this shape):

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

| Situation                    | Behavior                                                  |
| ---------------------------- | --------------------------------------------------------- |
| Image + desc present         | One **glue group**. Same parent, same child.              |
| Image without desc           | Atomic media block; no desc required.                     |
| Desc without preceding image | HTML/comment atomic block alone (do not invent an image). |
| Desc larger than hard max    | Keep glue group intact; oversized child allowed.          |
| Markers inside a code fence  | Literal text; **not** an image-desc region.               |
| Extra HTML comments          | Ordinary HTML unless they match the exact markers above.  |

**Parent split:** never place the image in one parent and its `image-desc` in the next. If a size-based parent pack would separate them, move the whole glue group into the next parent (or keep the group in the previous parent and start the new parent after the group).

### Lists, tables, quotes

| Construct                              | Edge rule                                             |
| -------------------------------------- | ----------------------------------------------------- |
| Loose list (blank lines between items) | Still **one** list block until the list ends.         |
| List item longer than hard max         | Whole list atomic in v1 (oversized exception).        |
| Table                                  | Atomic; oversized → oversized child/parent exception. |
| Blockquote                             | Atomic in v1 (opaque).                                |

### Forced prose splits (paragraphs only)

When packing children and a **single paragraph** block exceeds `childHardMaxTokens`:

1. Split on sentence boundaries (`. `, `? `, `! `) preferring chunks near `childTargetTokens`.
2. If a single sentence still exceeds hard max, split on whitespace nearest the target size.
3. Apply overlap of `childOverlapTokens` only between the resulting prose pieces, still within the same parent.
4. Never apply this procedure inside fences, tables, lists, image-desc bodies, or headings.

### Oversized atomic blocks

Size knobs are **soft constraints** for prose packing. Atomic blocks and glue groups always win.

| Case                                               | Parent                          | Child                          |
| -------------------------------------------------- | ------------------------------- | ------------------------------ |
| Atomic ≤ `parentMaxTokens`, > `childHardMaxTokens` | Stays in current section parent | Alone as one child             |
| Atomic > `parentMaxTokens`                         | That block alone is one parent  | One child (= full parent text) |
| Glue group > `parentMaxTokens`                     | Whole group is one parent       | One child                      |

v1 does not drop or truncate these blocks.

### Heading and structure edge cases

| Situation                                 | Behavior                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `#` only, no `##`                         | Single parent = full body                                                            |
| Body starts with prose before first `##`  | First parent = preamble through the line before first `##`                           |
| Empty `##` section (heading with no body) | One child equal to the heading text (searchable)                                     |
| `####` and deeper                         | Do not start parents; stay inside current `##` / `###` pack                          |
| Setext headings                           | Prefer ATX in the corpus; follow whatever `Bun.markdown` emits for Setext if present |

### Empty and whitespace-only bodies

| Input                          | Result                               |
| ------------------------------ | ------------------------------------ |
| Empty / whitespace-only `body` | No parents, no children              |
| Heading-only page              | One parent, one child (heading text) |

## Query path

```text
question → embed → search children only
        → expand to unique parents (via child → parent)
        → dedupe / merge overlapping parents
        → apply budget (max parents / max characters)
        → LLM sees parent texts (+ page title / slug)
```

Do not send children to the LLM. Short pages: one small parent ≈ full body.

## Incremental updates (page hash)

The skip gate is the **markdown page**, not each child. Store `pages.content_hash` over stable fields (normalize newlines first), for example:

`sha256(title + type + tags + body)`

| Situation                                   | Action                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Hash matches stored page                    | Skip — no re-chunk, no re-embed                                   |
| Hash differs                                | Replace that page’s parents and children, then embed new children |
| Markdown unchanged, embedding model changed | Re-embed children whose `embedding_model` is stale                |

Do not rely on per-child file hashes as the primary gate. Shared path: hash check → optional replace tree → chunkify → embed children → update `content_hash` / `embedding_model`.

See also [appendix-a-data-model.md](./appendix-a-data-model.md) and [appendix-b-vector-search.md](./appendix-b-vector-search.md).

## One-line rule

**Parents = markdown sections (size-capped); children = small packs inside a parent for search; atomic blocks (fences, image-desc glue, tables, lists) never split; LLM gets parents via the child → parent link.**
