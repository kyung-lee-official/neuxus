# Chunkify strategy (parent–child + structure-first)

**Parents** = generation context. **Children** = retrieval units. Structure decides parents; size only refines children and oversized parents. Do not slice the whole file every N characters as the first step.

**`body`** is ingest-normalized page markdown ([02-ingest.md](./02-ingest.md)), stored as `kb_pages.body`, **before** `chunkify`. Parents and children are slices of this string, not a second copy of the file.

Related: [01-corpus.md](./01-corpus.md), [02-ingest.md](./02-ingest.md), [04-embed.md](./04-embed.md), [05-query.md](./05-query.md), [06-synthesis.md](./06-synthesis.md), [appendix-a-data-model.md](./appendix-a-data-model.md).

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

No I/O. Caller supplies `body` (frontmatter already stripped, ingest-normalized) and resolved knobs. Each `text` is `body.slice(start, end)` — keep blank lines inside the span; do not compact.

| In scope                                          | Out of scope                                |
| ------------------------------------------------- | ------------------------------------------- |
| Idempotent body normalize, lex, parent/child pack | Hash skip gate, persist, embed, query / LLM |

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

**Tree:** page →\* parent →\* child. Children never cross a parent boundary; overlap (if any) stays inside one parent. Persistence FKs and page replace-on-edit: [appendix-a](./appendix-a-data-model.md). Query expand: [05-query.md](./05-query.md).

## Lex

**Lex** turns normalized `body` into an ordered list of **blocks** (heading, paragraph, fence, list, …), each with `start` / `end` into that string.

It does not decide parent or child size. It only classifies source regions so later packing can work on whole blocks. Fences and image_desc win over paragraph rules; interior of an unclosed fence is not re-classified as headings or lists.

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

Packing is the middle path: concatenate neighboring blocks toward `childTargetTokens` / `parentMaxTokens`, stop before the next unit would exceed the target (mixed packs), keep glue groups together.

```text
Lex:     [## Tips] [para] [fence] [para] [fence]
Pack:    └── child 0 (search unit) ──┘ └── child 1 ──┘
         └──────────── parent 0 (LLM context) ────────┘
```

Rules for how parents and children are packed: [Pipeline](#pipeline).

## Parser and tokens

| Concern   | Decision                                                                |
| --------- | ----------------------------------------------------------------------- |
| Dialect   | GFM                                                                     |
| Lex       | Custom `lex.ts` — no third-party markdown parser                        |
| Tokenizer | `ai-tokenizer`; app default encoding **`o200k_base`** (DB may override) |

## Knobs

DB may store overrides ([appendix-a](./appendix-a-data-model.md)); missing values use these **application defaults**:

| Knob                      | Default      | Role                                                              |
| ------------------------- | ------------ | ----------------------------------------------------------------- |
| `childTargetTokens`       | `400`        | Soft child pack target                                            |
| `childHardMaxTokens`      | `500`        | Hard max when [force-splitting](#forced-prose-splits) a paragraph |
| `childOverlapTokens`      | `60`         | Token **budget** after a legal snap ([overlap](#overlap))         |
| `childCrumbMinTokens`     | `64`         | Merge crumbs into previous child ([children](#children))          |
| `parentMaxTokens`         | `1400`       | Max parent before `###` / block re-pack                           |
| `fenceIntroGlueMaxTokens` | `40`         | Max lead-in paragraph glued to following fence                    |
| `tokenizerEncoding`       | `o200k_base` | App default encoding for `count`; DB may override                 |

Fixed policy (not a knob): parent cuts `##` → `###` → block packs. Atomic blocks may exceed size knobs as one unit ([Oversized](#oversized-atomic-blocks)).

## Pipeline

1. Treat `body` as already ingest-normalized ([02-ingest.md](./02-ingest.md#body)); a second `normalizeBody` pass is idempotent.
2. Lex into [blocks](#block-inventory).
3. Build [parents](#parents).
4. Pack [children](#children) inside each parent (whole blocks only; only paragraphs may [force-split](#forced-prose-splits)).

### Overlap

`childOverlapTokens` is a **budget**, used only after a [forced prose split](#forced-prose-splits). Measure it on the previous piece’s **tail after the snap**, not as a raw N-token suffix of the unsplit paragraph. Size may be under 60.

The **end** of the previous child and the **start** of the next child must both land on a legal index. Never mid-word / mid-sentence.

**Packing** already cuts at heading and paragraph boundaries. Lists stay atomic (no cut between items). [Force-split](#forced-prose-splits) and overlap run **inside one paragraph**, so the live snaps are sentence and `\n` only.

**Legal indices** (exclusive ends / next starts): `0`, paragraph end, and every position **after** a terminator:

- ASCII `.` / `?` / `!` only if the next character is space, `\n`, or end of the piece (`3.14`, `e.g.` do not snap; `Mr. Smith` may snap after `Mr.` — no abbreviation list)
- each `\n`

The previous piece **owns** the terminator and any following spaces on that line (and the `\n` when that is the snap). The next piece starts at the following character.

**Cut end** (first piece of an oversized paragraph). Let `T` = largest index with tokens ≤ `childTargetTokens`, `H` = largest index with tokens ≤ `childHardMaxTokens`:

1. Last legal index ≤ `T` and `> 0`
2. Else first legal index in (`T`, `H`]
3. Else last whitespace in `(0, H]`
4. Else `H` — only if the paragraph has no space/`\n` (sole mid-word escape)

**Overlap start** (next child): among legal indices `S` in the previous piece with `count(piece[S : cut]) ≤ childOverlapTokens`, pick the `S` with the **largest tail** (most overlap without exceeding the budget). `S = cut` is always legal (zero overlap). Require `S` greater than the previous start so the loop advances. If no other legal `S` fits the budget, skip overlap — do not start mid-sentence.

### Parents

1. One parent per `##` (heading through next `##` / EOF). Preamble before the first `##` is its own first parent. No `##` → one parent for the whole body. Trailing blank runs attach to the **previous** parent (and its last child): parent 0 ends at the last `\n` before the next `##`.
2. If over `parentMaxTokens`: split on `###`, then pack blocks ≤ max without breaking atomics or [glue groups](#glue-groups).
3. Empty `##`: one child = heading text. `####`+ do not start parents. Only [ATX headings](#headings) (`#{1,6} `). Setext underlines are not headings.

### Children

1. Pack toward `childTargetTokens`. Mixed packs (any atomic + prose) **stop at target**: if adding the next unit would exceed target, flush first. `childHardMaxTokens` applies only when [force-splitting](#forced-prose-splits) a single paragraph. An atomic already over target stays alone ([Oversized](#oversized-atomic-blocks)).
2. [Fence intro](#fence-intro-glue) and [image_desc glue](#image-descriptions) stay in one child (glue wins over knobs).
3. [Overlap](#overlap) only after [forced prose split](#forced-prose-splits).
4. Merge crumbs under `childCrumbMinTokens` into the previous child if combined tokens ≤ `childHardMaxTokens`, **or** if that previous child is already over `childHardMaxTokens`.

## Atomic blocks and edge cases

Same normalized `body` + knobs ⇒ same spans. Every region is exactly one block type; fences and image_desc win over paragraph rules.

### Block inventory

| Block          | Recognition                                      | Atomic?                                      |
| -------------- | ------------------------------------------------ | -------------------------------------------- |
| ATX heading    | [Headings](#headings)                            | Yes                                          |
| Fenced code    | [Code fences](#code-fences)                      | Yes                                          |
| Image          | Sole `![…](…)` or `<img>` paragraph              | Yes                                          |
| Image_desc     | [Image descriptions](#image-descriptions)        | Yes (glue with image)                        |
| Indented code  | ≥4 spaces / tab run                              | Yes                                          |
| List           | Items until list ends (loose blanks stay inside) | Yes                                          |
| Table          | GFM header + delimiter + rows                    | Yes                                          |
| Blockquote     | Contiguous `>` (opaque nested structure)         | Yes                                          |
| Thematic break | `---` / `***` / `___` alone                      | Yes                                          |
| HTML block     | [HTML blocks](#html-blocks)                      | Yes                                          |
| Paragraph      | Otherwise                                        | No (splittable)                              |
| Blank run      | `\n+` between blocks                             | — (trailing blanks attach to previous slice) |

### Headings

Only ATX: `#{1,6} ` at line start. Setext (`Setup` / `=====`) is not a heading: the title line is a paragraph; an underline that matches a thematic break is an `hr`.

### Glue groups

Adjacent blocks that must share one parent and one child. Currently: **image + image_desc** (optional blank between).

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

If the paragraph immediately before a fence (blanks between allowed) has ≤ `fenceIntroGlueMaxTokens`, pack **intro + fence** as one child. Glue wins over size knobs: if the pair exceeds `childTargetTokens` / `childHardMaxTokens`, it is still one child and follows [Oversized](#oversized-atomic-blocks). Otherwise pack the intro with prior prose and the fence alone (or with what follows under normal rules).

### Image descriptions

A two-line open/close pair immediately after an image:

```markdown
![Alt text](path-or-url "optional title")
<!-- image_desc -->
Description lines (one or more)…
<!-- /image_desc -->
```

- **Markers:** exact-match lines (after `String.prototype.trim`).
  - Opener: `<!-- image_desc -->`
  - Closer: `<!-- /image_desc -->`
- **Whitespace:** no extra interior spaces. `<!--  image_desc -->` (with extra spaces inside the comment group) is rejected; the line falls through to the regular [HTML block](#html-blocks) handling.
- **Description text:** the lines between opener and closer, exactly. Multi-line descriptions preserve their paragraph breaks.
- **Empty description:** `<!-- image_desc -->\n<!-- /image_desc -->` (no lines between) is valid; the block's range is empty.
- **No preceding image:** the `image_desc` block has no glue group and is reclassified to `html` in the second pass (see [Glue groups](#glue-groups)).
- **Orphan opener (no closer in the file):** no `image_desc` block is emitted. The line falls through to the HTML block handler. The walker-level validator (see `shared/image-desc/validate.ts`) catches this and fail-fasts the whole markdown file.
- **Inside a fence:** the comment is literal text inside the fence; not recognized as `image_desc`.
- **Glued with the preceding image:** `image + (optional blank) + image_desc` is one child (image + description stay together, glue wins over size knobs).
- **Block range:** from the end of the opener line (past the `\n`) through the start of the closer line. The block's text slice contains only the description lines (no marker text).

### HTML blocks

A line that starts with indent ≤3 and `<`, except image (`<img>`) and [image-desc](#image-descriptions) markers. Span through the next blank line or EOF. Interior lines are not re-lexed as headings, lists, or fences.

### Forced prose splits

Only when a **single paragraph** exceeds `childHardMaxTokens`. Choose the cut end, then the next start, with the [overlap](#overlap) rules. Never inside fences, tables, image_desc, or headings.

### Oversized atomic blocks

Atomics, [glue groups](#glue-groups), and [fence-intro](#fence-intro-glue) pairs are never sliced to satisfy knobs.

| Case                                        | Parent                      | Child     |
| ------------------------------------------- | --------------------------- | --------- |
| ≤ `parentMaxTokens`, > `childHardMaxTokens` | Current section             | Alone     |
| > `parentMaxTokens`                         | Block (or glue group) alone | Same text |

### Empty body

Whitespace-only → no parents, no children.
