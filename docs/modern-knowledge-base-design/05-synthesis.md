# Synthesis (prompt to answer)

This doc is the **synthesis contract**: resolve the model, call the provider, return text.

## Provider

Call the provider's **`textChat`** capability with the configured synthesis model. The synthesis model and connection are application wiring; changing either affects only the next call.

## Window

The model declares its context window and max output tokens. If the window is unknown, do not call the provider. Prompt plus max output must fit the window (tokens).

## Input

The prompt is already assembled by the caller. It includes:

- Knowledge **parent** texts (each with a source line) from [04-retrieval.md](./04-retrieval.md)
- Image-description hits from the [image-description search](./04-retrieval.md#image-description-search)
- Personal memory and recent chat when the Ask path has them

Knowledge context comes from the caller's chosen knowledge base(s) ([04-retrieval.md](./04-retrieval.md#multiple-knowledge-bases)); parents from all of them are pooled into one context. Each parent is written under a source line listing its knowledge base, page, and title; the parent text keeps its own headings ([Image handling](#image-handling)). Memory and chat are separate. Empty parent list is allowed (memory/chat-only). If the prompt context does not contain the answer, the model should say so.

## Image handling

Retrieval returns parents and [image-description hits](./04-retrieval.md#result) as separate lists. Each hit is folded into the prompt by one rule, applied in order:

1. **Attached** — a retrieved parent from the same knowledge base and page has an image reference that resolves to the hit's `imagePath` ([canonical image path](./03.2-image-descriptions.md#canonical-image-path)): replace that parent's image reference `![alt](path)` with the description, in the prompt only. The stored `body` keeps the image reference `![alt](path)`.
2. **Standalone** — otherwise: append the description as its own sentence, labelled with its source.

A parent is written under a source line; the standalone sentence uses the same shape:

```text
From knowledge base "${knowledgeBaseId}", page "${pageId}" (title "${title}"):
${parent text}
```

```text
An image from knowledge base "${knowledgeBaseId}", page "${pageId}" (title "${title}") shows: ${description}
```

Example page, title **North Quay Relay** (knowledge base `docs`, page `guide/relay`), and its image hit:

```markdown
## Wiring

![North quay](assets/wiring.png)

The relay sits between the two quays.
```

```json
{
  "knowledgeBaseId": "docs",
  "pageId": "guide/relay",
  "title": "North Quay Relay",
  "imagePath": "guide/assets/wiring.png",
  "description": "A relay switch between two quays, with a 12V line labeled A.",
  "score": 0.82
}
```

**Attached** — the page's parent was retrieved; the image reference `![North quay](assets/wiring.png)` is replaced in the prompt only:

```text
From knowledge base "docs", page "guide/relay" (title "North Quay Relay"):
## Wiring

A relay switch between two quays, with a 12V line labeled A.

The relay sits between the two quays.
```

**Standalone** — the page's parent was not retrieved; the description is appended:

```text
An image from knowledge base "docs", page "guide/relay" (title "North Quay Relay") shows: A relay switch between two quays, with a 12V line labeled A.
```

## Output

Return the assistant text.
