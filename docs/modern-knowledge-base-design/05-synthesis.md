# Synthesis (prompt → answer)

Turn a built prompt into an answer string. Retrieve (question → parents) is [04-query.md](./04-query.md). Schema: [appendix-a-data-model.md](./appendix-a-data-model.md). Embed: [03-embed.md](./03-embed.md).

```text
retrieve parents → build prompt (parents + personal memory + chat) → synthesize → answer
```

This doc is the **synthesis contract**: read settings, call the provider, return text. Retry, timeouts, streaming, tools, and admin APIs are application layer. Ask HTTP is a caller, not this contract.

## Provider

Talk to the provider through a **synthesizer** interface (`synthesize(prompt) → string`). The first implementation is **MiniMax** (Anthropic-compatible Messages API). Callers must not import MiniMax HTTP details.

**All synthesis runtime config lives in Postgres** (`app_synthesis_settings`), not in env: provider, model, base URL, API key, max tokens. `DATABASE_URL` remains process env so the app can reach the database.

**Reset / default** when the settings row is missing or a column is null: provider **`minimax`**, model **`MiniMax-M3`**, base URL **`https://api.minimaxi.com/anthropic`**, `max_tokens` **`4096`**. Clearing columns back to null is a reset to those defaults.

## Settings in the database

Dedicated table `app_synthesis_settings` (Ask/synthesis, not a `kb_*` retrieval table): single row `id = 'default'`, **nullable columns**, **app defaults in code** when missing. Schema: [appendix-a-data-model.md](./appendix-a-data-model.md#synthesis-settings-table).

Unlike embed, nothing here is vector identity. Changing model or URL only affects the **next** `synthesize` call. Do not log `api_key`.

## Input

The prompt is already assembled by the caller. It includes:

- Knowledge **parent** texts (+ page title / slug) from [04-query.md](./04-query.md) — not child windows alone
- Personal memory and recent chat when the Ask path has them

Empty parent list is allowed (memory/chat-only). If the prompt context does not contain the answer, the model should say so. Exact prompt wording is application layer.

## Output

Return the assistant text. Do not persist synthesis settings onto `kb_children` or chat rows as part of this contract.
