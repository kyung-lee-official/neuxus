# Synthesis (prompt → answer)

Turn a built prompt into an answer string.

This doc is the **synthesis contract**: resolve the model, call the provider, return text. Retry, timeouts, streaming, tools, and admin APIs are application layer. Ask HTTP is a caller, not this contract.

## Provider

Call the provider's **`textChat`** capability with the configured synthesis model. Callers must not import provider HTTP details. The synthesis model and connection are application wiring, not vector identity — changing either affects only the next call. Do not log provider credentials.

## Window

The model declares its context window and max output tokens. If the window is unknown, do not call the provider. Prompt plus max output must fit the window (tokens); product caps (trim memory/chat/parents) sit inside it and do not replace it.

## Input

The prompt is already assembled by the caller. It includes:

- Knowledge **parent** texts (+ page title) from [04-retrieval.md](./04-retrieval.md) — not child windows alone
- Personal memory and recent chat when the Ask path has them

Empty parent list is allowed (memory/chat-only). If the prompt context does not contain the answer, the model should say so. Exact prompt wording is application layer.

## Output

Return the assistant text. Do not persist synthesis settings onto `kb_children` or chat rows as part of this contract.
