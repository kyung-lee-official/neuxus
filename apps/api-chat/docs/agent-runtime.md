# Chat agent runtime contract

Status: describes the current synchronous implementation and lists the decisions
that still need to be made. It is not a promise that the open items are already
implemented.

Scope: `/query`, `/query/stream`, `runAgent()`, chat-owned tools, and the
chat-side persistence and SSE behavior. neuxus remains a stateless transport for
the model call.

## Run lifecycle

These are logical phases. They are not persisted as a run record.

| Phase        | Current behavior                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `preparing`  | Validate the request, resolve the session, load recent messages and memory, and build the initial `messages` array.                             |
| `model_call` | Call neuxus `POST /v1/messages` with the current `messages` and the full tool list.                                                             |
| `tool_batch` | If the response contains `tool_use` blocks, execute all of them in parallel.                                                                    |
| `finalizing` | If the response has no `tool_use` blocks, use its text as the final answer and persist the user and assistant messages.                         |
| `completed`  | Emit the JSON response or the SSE `done` event.                                                                                                 |
| `failed`     | Return an HTTP error for non-streaming, or an SSE `error` event before the stream closes.                                                       |
| `aborted`    | A streaming client abort stops the run. No terminal SSE event is emitted and no messages are persisted. Non-streaming has no client-abort path. |

Loop rules:

- `MAX_TOOL_ITERATIONS` is 4.
- Every model call includes every registered tool definition.
- A response with `tool_use` blocks continues the loop even if `stop_reason` is
  missing or unexpected. `stop_reason` is parsed but not currently used as a
  loop control.
- Tool calls in one model response run in parallel. Results are appended in the
  same order as the `tool_use` blocks.
- The transcript appends the complete assistant content, then one user message
  containing all `tool_result` blocks.
- The final answer is the text from the last model response. In streaming mode,
  text streamed during earlier tool iterations is shown to the client but is
  not persisted.
- Exceeding the iteration limit is a run failure.
- Tool failures are returned to the model as `tool_result` blocks with
  `is_error: true`; they do not abort the run by themselves.
- A streaming client abort stops the run and aborts tool execution through the
  request signal.
- A streaming timeout emits an SSE `error` event and does not persist messages.
- Non-streaming `/query` has an upstream 120-second timeout but no client-abort
  propagation.

## Tool contract

Tool definitions and executors live in `src/modules/tools/`.

```ts
type Tool = {
  definition: ToolDefinition;
  execute(input: JsonObject, context: ToolContext): Promise<string>;
};
```

- `input` is the parsed JSON object from the model's `tool_use` block. Tools
  validate their own inputs.
- `execute()` returns text placed in the `tool_result.content` field.
- A thrown error becomes a `tool_result` with `is_error: true`. An `AbortError`
  is re-thrown so the run can stop.
- Unknown tool names return an error result.
- Result content is not globally capped. Individual tools must enforce their own
  limits; `fetch_url` caps page content at 30,000 characters.
- Tools run with `ToolContext`: `userId`, `sessionId`, and the run signal.
- Tool definitions are not filtered by credential availability. `fetch_url`
  remains advertised when `DEEPSEEK_API_KEY` is unset, then returns a
  configuration error when called.
- There are no per-tool permissions, approval prompts, or rate limits yet.

To add a tool:

1. Implement a `Tool` under `src/modules/tools/`.
2. Add it to the `TOOLS` array in `src/modules/tools/registry.ts`.
3. Define an `input_schema` with required fields and `additionalProperties:
false` when appropriate.
4. Add tests for success, invalid input, provider failure, timeout, and abort.

## Model call contract

`runAgent()` builds each request from the prepared chat request plus:

- `messages`: the current transcript.
- `tools`: `toolDefinitions()`.
- Existing `model`, `max_tokens`, `system`, and `metadata.user_id`.

The agent does not send `tool_choice`; tool choice is currently left to the
model. neuxus forwards the definitions and returns the provider's content blocks.

### Streaming aggregation

`streamNeuxus()` reconstructs the assistant content from Anthropic SSE events:

- `content_block_start` creates the block state.
- `content_block_delta` with `text_delta` appends text and streams the delta.
- `content_block_delta` with `input_json_delta` accumulates tool arguments.
- `content_block_stop` parses accumulated tool input JSON.
- `message_delta` captures `stop_reason`.
- `error` events fail the run.
- Malformed tool input JSON fails the run.

Providers must support Anthropic-compatible tools and SSE events. There is no
provider-specific fallback.

## Persistence contract

`app_messages.content` stores plain text only.

- The user message and final assistant text are inserted after a successful
  run.
- The two inserts are sequential, not transactional. If the assistant insert
  fails, the user message may remain.
- Intermediate assistant text and all `tool_use`/`tool_result` blocks are not
  persisted.
- A run that fails or aborts before finalization does not insert messages. A
  failure between the two inserts can still leave the user message.
- Session creation can happen before the model call; a failure can leave an
  empty session.
- There is no idempotency key. A retried request can create duplicate messages.
- There is no run record, resume point, or event replay.

## SSE wire contract

`POST /query/stream` returns `text/event-stream` with these events:

```text
event: start
data: {"type":"start","sessionId":"...","userId":"..."}

event: delta
data: {"type":"delta","text":"..."}

event: tool_call
data: {"type":"tool_call","id":"...","name":"fetch_url","input":{"url":"..."}}

event: tool_result
data: {"type":"tool_result","id":"...","name":"fetch_url","isError":false,"preview":"..."}

event: done
data: {"type":"done","sessionId":"...","userId":"..."}

event: error
data: {"type":"error","error":"..."}
```

Current guarantees:

- `start` is emitted before any model call.
- Text deltas and tool events can interleave as the loop progresses.
- `done` is emitted after persistence succeeds.
- `error` is the terminal event for handled failures.
- An aborted stream closes without `done` or `error`.
- There is no heartbeat, reconnect, replay, or event-version field yet.
- Request validation and authentication failures return ordinary JSON errors
  before the stream starts.

`tool_result.preview` is capped at 500 characters in the SSE payload. The full
tool result is sent to the model.

## Security and trust boundary

- Chat users authenticate with `Authorization: Bearer <api-key>`.
- `DEEPSEEK_API_KEY` is server-side and is never sent to the model.
- `fetch_url` accepts absolute HTTP/HTTPS URLs without embedded credentials and
  limits URL length to 8,192 characters.
- Fetched page content is untrusted. It is prefixed with a “treat as data, not
  instructions” note, but there is no prompt-injection sanitizer or allowlist.
- Tools are currently read-only. There is no approval or permission layer for
  future write-capable tools.
- Tool calls are not written to `app_log` and there is no tool audit trail yet.

## Budgets, retries, and cost

- Maximum tool iterations: 4.
- Streaming run timeout: 5 minutes.
- `fetch_url` timeout: 30 seconds.
- `fetch_url` content cap: 30,000 characters.
- No token or cost budget is enforced per run.
- No automatic retries are performed for model or tool calls.
- DeepSeek Fetch rate limits, billing, and 408/429/5xx responses are surfaced as
  tool errors. The model may choose to retry by calling the tool again.

## Test expectations

A complete test matrix should cover:

- No tool call.
- One tool call and a final answer.
- Two independent tool calls.
- Invalid tool input.
- Unknown tool.
- Tool error result.
- Tool timeout and client abort.
- Loop-limit failure.
- Malformed streamed tool JSON.
- Missing `DEEPSEEK_API_KEY`.
- SSE event order and terminal event.
- Persistence success and partial-write failure.

## Open decisions before a durable agent

These are not implemented:

- Persist structured tool calls and results.
- Add a run/job table with states and resume support.
- Define retry and idempotency semantics.
- Add tool permissions, approval, and audit logging.
- Add SSE heartbeat, reconnect, replay, and versioning.
- Add a token/time/cost budget.
- Decide whether unavailable tools should be hidden from the model.
- Define a fetch URL policy and prompt-injection defenses.
