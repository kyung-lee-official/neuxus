# Chunkify strategy (parent–child + structure-first)

**Parents** = generation context. **Children** = retrieval units. Structure decides parents; size only refines children and oversized parents. Do not slice the whole file every N characters as the first step.

Related: [appendix-a-data-model.md](./appendix-a-data-model.md), [appendix-b-vector-search.md](./appendix-b-vector-search.md).

## Body

**`body`** is the page’s markdown **after ingest**, stored as `kb_pages.body`, **before** `chunkify`. Frontmatter is already stripped (title/tags are columns). Newlines are already `\n` ([Body ownership](#body-ownership)). Parents and children are slices of this string, not a second copy of the file.

```text
file.md → strip frontmatter → \r\n → \n → kb_pages.body → chunkify(body)
```

## Pure function

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

No I/O. Caller supplies `body` (frontmatter already stripped, **newline-normalized at ingest** — see [Body ownership](#body-ownership)) and resolved knobs. Each `text` is `body.slice(start, end)` — keep blank lines inside the span; do not compact.

| In scope                          | Out of scope                                |
| --------------------------------- | ------------------------------------------- |
| Normalize, lex, parent/child pack | Hash skip gate, persist, embed, query / LLM |

## Why parent–child

|             | Small chunks only | Large chunks only |
| ----------- | ----------------- | ----------------- |
| Retrieval   | Precise           | Blurry            |
| LLM context | Thin              | Better            |

| Role       | Purpose                       | Embedded? |
| ---------- | ----------------------------- | --------- |
| **Child**  | Search / match                | Yes       |
| **Parent** | LLM context when a child hits | No        |

Child size tracks **embedding precision**; parent size tracks **useful context** (+ remaining LLM budget).

**Tree:** page →\* parent →\* child. Children never cross a parent boundary; overlap (if any) stays inside one parent. Persistence FKs and page replace-on-edit: [appendix-a](./appendix-a-data-model.md). Query expand: [appendix-b](./appendix-b-vector-search.md).

## Lex

**Lex** turns normalized `body` into an ordered list of **blocks** (heading, paragraph, fence, list, …), each with `start` / `end` into that string.

It does not decide parent or child size. It only classifies source regions so later packing can work on whole blocks. Fences and image-desc win over paragraph rules; interior of an unclosed fence is not re-classified as headings or lists.

Block kinds and edge rules: [Atomic blocks](#atomic-blocks-and-edge-cases).

## Packing

At query time a hit on a child loads its parent via the link already stored. **Packing is not that lookup.** It is how those linked units are **built** from lexed blocks.

Lex only yields source blocks (heading, paragraph, fence, …). Packing decides which neighbors share one parent and which share one child (one embedding), under the size knobs, without cutting atomics.

Without packing you would have to pick a blunt default:

| Default                  | Result                |
| ------------------------ | --------------------- |
| One child per lex block  | Tiny, weak embeddings |
| One child = whole parent | Blurry embeddings     |
| Slice every N characters | Cuts fences / lists   |

Packing is the middle path: concatenate neighboring blocks toward `childTargetTokens` / `parentMaxTokens`, stop before overflow, keep glue groups together.

```text
Lex:     [## Tips] [para] [fence] [para] [fence]
Pack:    └── child 0 (search unit) ──┘ └── child 1 ──┘
         └──────────── parent 0 (LLM context) ────────┘
```

Rules for how parents and children are packed: [Pipeline](#pipeline).

## Parser and tokens

| Concern | Decision                                                      |
| ------- | ------------------------------------------------------------- |
| Dialect | GFM                                                           |
| Count   | A stable tokenizer API (`count(text)`); encoding id is a knob |

## Knobs

DB may store overrides ([appendix-a](./appendix-a-data-model.md)); missing values use these **application defaults**:

| Knob                      | Default                    | Role                                                       |
| ------------------------- | -------------------------- | ---------------------------------------------------------- |
| `childTargetTokens`       | `400`                      | Soft child pack target                                     |
| `childHardMaxTokens`      | `500`                      | Hard max for **splittable prose** only                     |
| `childOverlapTokens`      | `60`                       | Token **budget** after sentence snap ([overlap](#overlap)) |
| `childCrumbMinTokens`     | `64`                       | Merge smaller crumbs into previous child when allowed      |
| `parentMaxTokens`         | `1400`                     | Max parent before `###` / block re-pack                    |
| `fenceIntroGlueMaxTokens` | `40`                       | Max lead-in paragraph glued to following fence             |
| `tokenizerEncoding`       | _(implementation-defined)_ | Tokenizer encoding / model id used for `count`             |

Fixed policy (not a knob): parent cuts `##` → `###` → block packs. Atomic blocks may exceed size knobs as one unit ([Oversized](#oversized-atomic-blocks)).

## Pipeline

1. Treat `body` as already newline-normalized ([Body ownership](#body-ownership)); a second `\r\n` → `\n` pass is idempotent.
2. Lex into [blocks](#block-inventory).
3. Build [parents](#parents).
4. Pack [children](#children) inside each parent (whole blocks only; only paragraphs may [force-split](#forced-prose-splits)).

### Body ownership

Ingest persists **newline-normalized** `kb_pages.body` (`\r\n` / `\r` → `\n`). Hashes, `chunkify` offsets, and stored slices all use that string — not original file bytes. A second normalize pass in `chunkify` is idempotent. CRLF round-trip is out of scope.

### Overlap

`childOverlapTokens` is a **budget**, used only after a [forced prose split](#forced-prose-splits). Measure it on the previous piece’s **tail after the sentence (or whitespace) snap**, not as a raw N-token suffix of the unsplit paragraph. Prefer whole sentences (size may be under 60); never start mid-word when a boundary exists.

### Parents

1. One parent per `##` (heading through next `##` / EOF). Preamble before the first `##` is its own first parent. No `##` → one parent for the whole body.
2. If over `parentMaxTokens`: split on `###`, then pack blocks ≤ max without breaking atomics or [glue groups](#glue-groups).
3. Empty `##`: one child = heading text. `####`+ do not start parents. Prefer ATX headings.

### Children

1. Pack toward `childTargetTokens`; `childHardMaxTokens` applies to prose packs only.
2. [Fence intro](#fence-intro-glue) and [image-desc glue](#image-descriptions) stay in one child.
3. [Overlap](#overlap) only after [forced prose split](#forced-prose-splits).
4. Merge crumbs under `childCrumbMinTokens` into the previous child when allowed.

## Atomic blocks and edge cases

Same normalized `body` + knobs ⇒ same spans. Every region is exactly one block type; fences and image-desc win over paragraph rules.

### Block inventory

| Block          | Recognition                                      | Atomic?                |
| -------------- | ------------------------------------------------ | ---------------------- |
| ATX heading    | `#{1,6} ` at line start                          | Yes                    |
| Fenced code    | [Code fences](#code-fences)                      | Yes                    |
| Image          | Sole `![…](…)` or `<img>` paragraph              | Yes                    |
| Image-desc     | [Image descriptions](#image-descriptions)        | Yes (glue with image)  |
| Indented code  | ≥4 spaces / tab run                              | Yes                    |
| List           | Items until list ends (loose blanks stay inside) | Yes                    |
| Table          | GFM header + delimiter + rows                    | Yes                    |
| Blockquote     | Contiguous `>` (opaque nested structure)         | Yes                    |
| Thematic break | `---` / `***` / `___` alone                      | Yes                    |
| HTML block     | CommonMark HTML (except image-desc markers)      | Yes                    |
| Paragraph      | Otherwise                                        | No (splittable)        |
| Blank run      | `\n+` between blocks                             | — (kept inside slices) |

### Glue groups

Adjacent blocks that must share one parent and one child. Currently: **image + image-desc** (optional blank between).

### Code fences

- Open: indent ≤3, ≥3 `` ` `` or `~`, optional info string. Close: same character family, length ≥ opener, no info string. Span is open line through close line inclusive.
- Unclosed → through EOF; interior lines are not re-lexed as headings/lists.
- First matching closer wins; backtick vs tilde families do not cross.
- Prefer fences outside lists; markers inside a fence are literal.
- Never split a fence across children. Size: [Oversized](#oversized-atomic-blocks).

### Fence intro glue

````markdown
## Examples

Here is the setup code:

```ts
export const x = 1;
```
````

If the paragraph immediately before a fence has ≤ `fenceIntroGlueMaxTokens`, pack **intro + fence** as one child. Otherwise pack the intro with prior prose and the fence alone (or with what follows under normal rules).

### Image descriptions

```markdown
![Alt text](path-or-url "optional title")

<!-- image-desc -->

Description lines…

<!-- /image-desc -->
```

Markers: lines exactly `<!-- image-desc -->` / `<!-- /image-desc -->` (trim that line only). Missing closer → through next heading, fence opener, or EOF; still glue to the image. Markers inside a fence are literal. Desc without an image = lone HTML block. Never split image and desc across parents.

### Forced prose splits

Only when a **single paragraph** exceeds `childHardMaxTokens`: snap the cut to a **sentence** boundary near `childTargetTokens` (else whitespace / word — never mid-word). Then apply [overlap](#overlap). Never inside fences, tables, lists, image-desc, or headings.

### Oversized atomic blocks

Atomics and glue groups are never sliced to satisfy knobs.

| Case                                        | Parent                      | Child     |
| ------------------------------------------- | --------------------------- | --------- |
| ≤ `parentMaxTokens`, > `childHardMaxTokens` | Current section             | Alone     |
| > `parentMaxTokens`                         | Block (or glue group) alone | Same text |

### Empty body

Whitespace-only → no parents, no children.

## Incremental updates (page hash)

Skip gate is the **page**, not each child. Example: `sha256(title + type + tags + body)` on the stored (newline-normalized) `body`.

| Situation                          | Action                                                     |
| ---------------------------------- | ---------------------------------------------------------- |
| Hash match                         | Skip                                                       |
| Hash differs                       | Replace that page’s parent/child tree, then embed children |
| Same markdown, new embedding model | Re-embed stale children                                    |

Shared path: hash check → optional replace → `chunkify` → embed → update `content_hash` / `embedding_model`.
