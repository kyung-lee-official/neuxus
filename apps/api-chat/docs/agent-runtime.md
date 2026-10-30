# Chat agent runtime contract

Status: describes the current synchronous and durable implementations. Open
items are marked explicitly; they are not implemented promises.

Scope: `/query`, `/query/stream`, `/query/async`, durable runs, chat-owned tools,
and chat-side persistence and SSE behavior. neuxus remains a stateless transport
for the model call.

Durable mode requires the `agent_runs` and `agent_events` migration. Without it,
the worker disables itself and `/query/async` is unavailable; synchronous
`/query` and `/query/stream` still work.

## Execution modes

| Mode              | Endpoint             | Durable | Resume | Event replay |
| ----------------- | -------------------- | ------- | ------ | ------------ |
| Synchronous JSON  | `POST /query`        | No      | No     | No           |
| Synchronous SSE   | `POST /query/stream` | No      | No     | No           |
| Durable run       | `POST /query/async`  | Yes     | Yes    | Yes          |

All three modes run the same `runAgent()` loop. Durable runs add a database
record, an append-only event log, retries, and replay.

## Run lifecycle

These phases apply to both synchronous and durable runs. In durable mode,
`preparing` and each tool-batch checkpoint are stored.

| Phase        | Current behavior                                                                 |
| ------------ | -------------------------------------------------------------------------------- |
| `preparing`  | Validate the request, resolve the session, load recent messages and memory, and build the initial `messages` array. |
| `model_call` | Call neuxus `POST /v1/messages` with the current `messages` and the available tool list. |
| `tool_batch` | If the response contains `tool_use` blocks, execute all of them in parallel. |
| `finalizing` | If the response has no `tool_use` blocks, use its text as the final answer. |
| `completed`  | Persist the messages and emit the JSON response or the SSE `done` event. |
| `failed`     | Return an HTTP error or emit an SSE `error` event. |
| `aborted`    | A synchronous streaming client abort stops the run. A durable run is not cancelled by disconnecting its event stream. |

Loop rules:

- `CHAT_MAX_TOOL_ITERATIONS` defaults to 4.
- Every model call includes every currently available tool definition.
- A response with `tool_use` blocks continues the loop even if `stop_reason` is
  missing or unexpected. `stop_reason` is parsed but not currently used as a
  loop control.
- Tool calls in one model response run in parallel. Results are appended in the
  same order as the `tool_use` blocks.
- The transcript appends the complete assistant content, then one user message
  containing all `tool_result` blocks.
- The final answer is the text from the last model response. In synchronous
  streaming mode, text from earlier tool iterations is shown to the client but
  is not stored in `app_messages`.
- Exceeding the iteration limit is a run failure.
- Tool failures are returned to the model as `tool_result` blocks with
  `is_error: true`; they do not abort the run by themselves.
- A synchronous streaming client abort stops the run and aborts tool execution
  through the request signal.
- A synchronous streaming timeout emits an SSE `error` event and does not
  persist messages.
- Non-streaming `/query` has an upstream 120-second timeout but no client-abort
  propagation.

## Durable runs

A durable run is stored in `agent_runs`:

- `status`: `queued`, `running`, `completed`, or `failed`.
- `request`: the prepared model request without the mutable `messages` value.
- `messages`: the latest transcript checkpoint.
- `iteration`: completed tool batches at the checkpoint.
- `message`: the current user message written on completion.
- `attempts`: worker attempts so far.
- `answer` and `error`: terminal result fields.
- Optional `idempotencyKey`, unique per user.

`agent_events` is append-only:

- `seq` is monotonic per run and is also the SSE `id`.
- Event types are `start`, `delta`, `tool_call`, `tool_result`, `retry`, `done`,
  and `error`.
- Tool input is stored in the event; tool output is stored in the transcript and
  capped to a preview in the event.

Worker behavior:

- `POST /query/async` queues a run and returns `202`.
- The in-process worker polls `agent_runs` and claims one queued run at a time.
- On startup, `running` rows are reset to `queued`; interrupted runs resume from
  the last checkpoint.
- Checkpoints happen after each tool batch. A crash during a model call or tool
  batch can repeat that step.
- Execution is **at-least-once**. Tool implementations should be idempotent or
  tolerate repeated calls.
- `GET /query/runs/:id` returns status and terminal result.
- `GET /query/runs/:id/events` replays after `Last-Event-ID` or `?after=`, then
  follows new events.
- Disconnecting the event stream does not cancel the run.
- Completion is transactional: the user message, assistant message, session
  touch, run status, and `done` event commit together.
- The worker assumes a single app instance. Multi-instance deployment needs a
  lease or external queue.

## Tool contract

Tool definitions and executors live in `src/modules/tools/`.

```ts
type Tool = {
  definition: ToolDefinition;
  available?: () => boolean;
  execute(input: JsonObject, context: ToolContext): Promise<string>;
};
```

- `input` is the parsed JSON object from the model's `tool_use` block. Tools
  validate their own inputs.
- `execute()` returns text placed in the `tool_result.content` field.
- A thrown error becomes a `tool_result` with `is_error: true`. An `AbortError`
  is re-thrown so the run can stop.
- Unknown or unavailable tools return an error result.
- `toolDefinitions()` omits tools whose `available()` returns false.
- Result content is not globally capped. Individual tools must enforce their own
  limits; `fetch_url` caps page content at 30,000 characters.
- Tools run with `ToolContext`: `userId`, `sessionId`, and the run signal.
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

Synchronous modes:

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

Durable mode:

- `agent_runs` stores the prepared request, transcript checkpoints, status,
  attempts, and terminal result.
- `agent_events` stores the replayable event log, including full tool inputs and
  truncated tool-result previews.
- Completion atomically inserts the user and assistant messages, touches the
  session, marks the run completed, and appends `done`.
- `idempotencyKey` is unique per user for durable runs.
- Failed/aborted runs do not insert `app_messages`; their events remain.
- Tool calls are not stored in `app_messages`; structured history would require
  a schema change.

## SSE wire contract

Both `POST /query/stream` and `GET /query/runs/:id/events` use these event
payloads:

```text
event: start
data: {"type":"start","sessionId":"...","userId":"..."}

event: delta
data: {"type":"delta","text":"..."}

event: tool_call
data: {"type":"tool_call","id":"...","name":"fetch_url","input":{"url":"..."}}

event: tool_result
data: {"type":"tool_result","id":"...","name":"fetch_url","isError":false,"preview":"..."}

event: retry
data: {"type":"retry","error":"...","attempt":1}

event: done
data: {"type":"done","sessionId":"...","userId":"..."}

event: error
data: {"type":"error","error":"..."}
```

Current guarantees:

- `start` is emitted before any model call.
- Text deltas and tool events can interleave as the loop progresses.
- `done` is emitted after persistence succeeds.
- `error` is terminal for handled failures.
- `retry` is non-terminal; the durable worker requeues the run.
- A synchronous aborted stream closes without `done` or `error`.
- Durable events carry an SSE `id` equal to `seq` and can be replayed.
- Disconnecting the durable event stream does not cancel the run.
- There is no heartbeat or event-version field yet.
- Request validation and authentication failures return ordinary JSON errors
  before the stream starts.

`tool_result.preview` is capped at 500 characters in the SSE payload. The full
tool result is sent to the model and stored in the durable transcript.

## Security and trust boundary

- Chat users authenticate with `Authorization: Bearer <api-key>`.
- `DEEPSEEK_API_KEY` is server-side and is never sent to the model.
- `fetch_url` accepts absolute HTTP/HTTPS URLs without embedded credentials and
  limits URL length to 8,192 characters.
- Fetched page content is untrusted. It is prefixed with a “treat as data, not
  instructions” note, but there is no prompt-injection sanitizer or allowlist.
- Durable run rows contain the full model request, transcripts, and tool
  results. They are not encrypted or redacted.
- Tools are currently read-only. There is no approval or permission layer for
  future write-capable tools.
- Tool calls are not written to `app_log`; `agent_events` is a run log, not a
  security audit log.

## Budgets, retries, and cost

- Maximum tool iterations: `CHAT_MAX_TOOL_ITERATIONS`, default 4.
- Synchronous/durable run timeout: `CHAT_STREAM_TIMEOUT_MS`, default 5 minutes.
- Durable attempts: `CHAT_RUN_MAX_ATTEMPTS`, default 2.
- `fetch_url` timeout: 30 seconds.
- `fetch_url` content cap: 30,000 characters.
- Durable runs retry retryable `NeuxusClientError` failures (`429` and `5xx`).
- Synchronous modes do not retry.
- No token or cost budget is enforced per run.
- DeepSeek Fetch rate limits, billing, and 408/429/5xx responses are surfaced as
  tool errors. The model may choose to retry by calling the tool again.

## Test expectations

A complete test matrix should cover:

- No tool call.
- One tool call and a final answer.
- Two independent tool calls.
- Invalid tool input.
- Unknown/unavailable tool.
- Tool error result.
- Tool timeout and client abort.
- Loop-limit failure.
- Malformed streamed tool JSON.
- Missing `DEEPSEEK_API_KEY`.
- SSE event order and terminal event.
- Sync persistence success and partial-write failure.
- Durable checkpoint/resume.
- Durable idempotency key reuse.
- Durable retry exhaustion.
- Event replay from `Last-Event-ID`.

## Open decisions

Not implemented:

- Multi-instance worker leasing and an external queue.
- Serializing concurrent durable runs in the same session.
- Per-tool permissions, approvals, and security audit logging.
- Token/time/cost budgets.
- Structured tool history in `app_messages`.
- Idempotent tool execution under at-least-once retries.
- Heartbeats and event-schema versioning.
- A durable-run cancellation API.
- A fetch URL policy and prompt-injection defenses.
