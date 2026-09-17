# Synthesis (prompt → answer)

This doc is the **synthesis contract**: resolve the model, call the provider, return text.

## Provider

Call the provider's **`textChat`** capability with the configured synthesis model. The synthesis model and connection are application wiring; changing either affects only the next call.

## Window

The model declares its context window and max output tokens. If the window is unknown, do not call the provider. Prompt plus max output must fit the window (tokens).

## Input

The prompt is already assembled by the caller. It includes:

- Knowledge **parent** texts (+ page title) from [04-retrieval.md](./04-retrieval.md)
- Personal memory and recent chat when the Ask path has them

Empty parent list is allowed (memory/chat-only). If the prompt context does not contain the answer, the model should say so.

## Output

Return the assistant text.
