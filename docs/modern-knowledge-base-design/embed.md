# Embed (string → vector)

A pure utility with exactly one job: embed a string to a vector. No business logic, no persistence, no knowledge of callers.

## Application scenarios

- Embed chunk text for similarity search ([03.1-chunkify.md](./03.1-chunkify.md)).
- Embed image-description text for similarity search ([03.2-image-descriptions.md](./03.2-image-descriptions.md)).
- Embed the retrieval question for comparison with stored vectors ([04-retrieval.md](./04-retrieval.md)).

## What it does

```ts
embed(text: string): Promise<number[]>
```

|           |                                                               |
| --------- | ------------------------------------------------------------- |
| Input     | one string                                                    |
| Output    | one vector (array of numbers) produced by the embedding model |
| Effects   | none — the caller stores the vector and decides how to use it |

It does not choose the model, persist, truncate, batch, or retry. The embedding model is supplied by the caller.
