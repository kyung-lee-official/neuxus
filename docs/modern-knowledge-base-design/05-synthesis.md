# Synthesis (prompt to answer)

This doc is the **synthesis contract**: resolve the model, call the provider, return text.

## Provider

Call the provider's **`textChat`** capability with the configured synthesis model. The synthesis model and connection are application wiring; changing either affects only the next call.

## Window

The model declares its context window and max output tokens. If the window is unknown, do not call the provider. Prompt plus max output must fit the window (tokens).

## Input

The prompt is already assembled by the caller. It includes:

- Knowledge **parent** texts (each with a source line) from [04-retrieval.md](./04-retrieval.md)
- Image-description hits from the second search in [04-retrieval.md](./04-retrieval.md#image-description-search)
- Personal memory and recent chat when the Ask path has them

Knowledge context comes from the caller's chosen knowledge base(s) ([04-retrieval.md](./04-retrieval.md#multiple-knowledge-bases)); parents from all of them are pooled into one context. Each parent is written under a source line listing its knowledge base, page, and title; the parent text keeps its own headings ([Image handling](#image-handling)). Memory and chat are separate. Empty parent list is allowed (memory/chat-only). If the prompt context does not contain the answer, the model should say so.

## Image handling

An image-description hit from the second search ([04-retrieval.md](./04-retrieval.md#image-description-search)) is a row with a knowledge base, page id, page title, image path, description, and score.

Each hit is appended to the knowledge context as exactly one sentence; the description is never substituted into a parent's text, so a parent keeps its markdown image references (`![alt](path)`) untouched. The row turns into:

```text
An image from knowledge base "${knowledgeBaseId}", page "${pageId}" (title "${title}") shows: ${description}
```

A parent is written under the same source shape:

```text
From knowledge base "${knowledgeBaseId}", page "${pageId}" (title "${title}"):
${parent text}
```

Example page, title **North Quay Relay** (knowledge base `docs`, page `guide/relay`):

```markdown
## Wiring

![North quay](assets/wiring.png)

The relay sits between the two quays.
```

Retrieval returns this image hit:

```json
{
  "knowledgeBaseId": "docs",
  "pageId": "guide/relay",
  "title": "North Quay Relay",
  "imagePath": "assets/wiring.png",
  "description": "A relay switch between two quays, with a 12V line labeled A.",
  "score": 0.82
}
```

It is appended to the knowledge context as this sentence (the last state before the synthesis call):

```text
An image from knowledge base "docs", page "guide/relay" (title "North Quay Relay") shows: A relay switch between two quays, with a 12V line labeled A.
```

## Output

Return the assistant text.
