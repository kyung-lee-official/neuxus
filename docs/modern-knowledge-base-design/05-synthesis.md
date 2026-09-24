# Synthesis (prompt → answer)

This doc is the **synthesis contract**: resolve the model, call the provider, return text.

## Provider

Call the provider's **`textChat`** capability with the configured synthesis model. The synthesis model and connection are application wiring; changing either affects only the next call.

## Window

The model declares its context window and max output tokens. If the window is unknown, do not call the provider. Prompt plus max output must fit the window (tokens).

## Input

The prompt is already assembled by the caller. It includes:

- Knowledge **parent** texts (+ page title) from [04-retrieval.md](./04-retrieval.md)
- Image-description hits from the second search in [04-retrieval.md](./04-retrieval.md#image-description-search)
- Personal memory and recent chat when the Ask path has them

Knowledge context comes from one knowledge base; memory and chat are separate. Empty parent list is allowed (memory/chat-only). If the prompt context does not contain the answer, the model should say so.

## Image handling

A parent's text carries images only as markdown references (`![alt](path)`), so each image's stored description reaches the prompt one of two ways:

1. **Included with its parent** — replace the `![…](…)` inline, in the prompt only.
2. **Matched on its own** — append the description, labelled with its page title.

Example page, title **North Quay Relay**:

```markdown
## Wiring

![North quay](assets/wiring.png)

The relay sits between the two quays.
```

Description: `A relay switch between two quays, with a 12V line labeled A.`

- A question matching the prose pulls in the parent; its image line becomes:

  `A relay switch between two quays, with a 12V line labeled A. The relay sits between the two quays.`

- A question matching only the description appends:

  `North Quay Relay — A relay switch between two quays, with a 12V line labeled A.`

## Output

Return the assistant text.
