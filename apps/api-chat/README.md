# apps/api-chat

Stateful chat adapter for neuxus. It owns end-user identity, chat sessions,
messages, and personal memory. `/query` loads the session history and personal
memory, calls the stateless neuxus API for knowledge-base-enriched synthesis,
and persists both messages.

## Responsibilities

- User accounts and API-key auth
- Chat sessions and messages
- Personal memory (`/remember`)
- User data export
- Structured app logging (`app_log`, `app_log_settings`)
- Chat dialog: calls `POST /v1/messages` on the neuxus API
  (`NEUXUS_API_URL`, `NEUXUS_SERVICE_TOKEN`) and runs chat-owned tools such as
  `fetch_url` (`DEEPSEEK_API_KEY`)

It does not own knowledge, model providers, logs, or server settings. Those
belong to `apps/api`.

## Stack

| Piece                    | Role                                      |
| ------------------------ | ----------------------------------------- |
| Bun + Elysia             | HTTP API on `:3002`                       |
| Postgres (`neuxus-chat`) | Users, memories, sessions, messages, logs |
| Prisma                   | Schema and migrations                     |
| User API keys            | `Authorization: Bearer <api-key>`         |
| `apps/web`               | Chat UI at `/chat`                        |

The chat database is separate from the neuxus database. Do not import code from
`apps/api`; call it over HTTP.

## Query and agent loop

`POST /query` and `POST /query/stream` use `prepareAsk()` to load the session
history and personal memory, then `runAgent()` to drive the model/tool loop.
Each model call goes to neuxus `POST /v1/messages` with the current transcript
and the available tool definitions.

`runAgent()` follows the standard tool loop:

1. Call the model with `messages` and `tools`.
2. If the response has no `tool_use` blocks, return its text as the final answer.
3. Execute every `tool_use` block from the registry.
4. Append the assistant `tool_use` content and a user `tool_result` message to
   the transcript.
5. Call the model again with the updated transcript.
6. Stop when the model returns without tool calls, or when the loop limit is
   reached.

Tools are owned and executed by `api-chat`. neuxus only forwards their
definitions and returns the model's `tool_use` blocks.

### Tools and runtime contract

Tools live in `src/modules/tools/`; add a new tool by implementing `Tool` and
registering it in the `TOOLS` array. neuxus only forwards tool definitions and
returns `tool_use` blocks; `api-chat` executes them.

The normative contract for run lifecycle, tool execution, model calls,
persistence, SSE event schemas, security, budgets, and open decisions is in
[`docs/agent-runtime.md`](./docs/agent-runtime.md).

Current summary:

- `fetch_url` uses DeepSeek's Fetch API and requires `DEEPSEEK_API_KEY`.
- `/query` runs the same tool loop without a stream.
- `/query/stream` emits `start`, `delta`, `tool_call`, `tool_result`, `done`,
  and `error`.
- Only the final assistant text is persisted; tool calls are transient.

## Setup

1. Create the database:

```sql
CREATE DATABASE "neuxus-chat";
```

2. Create the env file:

```powershell
Copy-Item apps/api-chat/.env.example apps/api-chat/.env
```

Set:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/neuxus-chat
PORT=3002
NEUXUS_API_URL=http://localhost:3001
NEUXUS_SERVICE_TOKEN=<same value as apps/api/.env>
DEEPSEEK_API_KEY=<DeepSeek API key for chat tools>
```

3. Install, generate, and migrate (from `apps/api-chat`):

```powershell
bun install
bun run prisma:generate
bun run prisma -- migrate dev --name init
```

4. Seed chat users (optional; from `apps/api-chat`):

```powershell
bun run seed
```

From the monorepo root, use `bun run seed:api-chat`.

5. Dev:

```powershell
bun run dev
```

From the monorepo root, use `bun run dev:api-chat`.

- API: http://localhost:3002
- OpenAPI docs: http://localhost:3002/openapi
- OpenAPI spec: http://localhost:3002/openapi/json

## Seed users

| User id                                      | Role   | Default API key   |
| -------------------------------------------- | ------ | ----------------- |
| `haewon`                                     | admin  | `demo-key-haewon` |
| `lily`, `sullyoon`, `bae`, `jiwoo`, `kyujin` | member | `demo-key-<id>`   |

Without seed, the first created account becomes `admin`; later accounts are
`member`. The neuxus core itself has no seed data.

## Logging

The chat app has its own structured log system, mirroring `apps/api`:

- `app_log` stores log rows (`level`, `msg`, `name`, `meta`, optional `userId`,
  `createdAt`).
- `app_log_settings` is the singleton sink configuration row (`id = "default"`).
- `Logger.child(...)` writes through the bounded `PostgresTransport` queue.
- The default sink is `console`; enable `postgres` via `PUT /log/settings` to
  persist rows in `app_log`.
- `GET /users/:id/logs` pages a user's own `app_log` rows.
- Log settings and purge are admin-only:
  `GET/PUT /log/settings`, `POST /log/settings/reset`, `POST /log/purge`.

The schema contains these tables; run the migration you create for them before
starting the app.

## API

| Method   | Path                            | Auth                 | Purpose                          |
| -------- | ------------------------------- | -------------------- | -------------------------------- |
| `GET`    | `/health`                       | none                 | Liveness                         |
| `GET`    | `/users`                        | none                 | List users (sign-in screen)      |
| `POST`   | `/users`                        | first user or Bearer | Create a user                    |
| `GET`    | `/users/:id`                    | none                 | Get a user                       |
| `PATCH`  | `/users/:id`                    | Bearer               | Rotate/set the API key           |
| `DELETE` | `/users/:id`                    | Bearer               | Delete a user (cascades)         |
| `GET`    | `/users/:id/data`               | Bearer               | Memories, sessions, messages     |
| `GET`    | `/users/:id/logs`               | Bearer               | Paged user logs from `app_log`   |
| `DELETE` | `/users/:id/memories/:memoryId` | Bearer               | Delete a memory                  |
| `GET`    | `/sessions`                     | Bearer               | List the current user's sessions |
| `POST`   | `/sessions`                     | Bearer               | Create a session                 |
| `GET`    | `/sessions/:sessionId/messages` | Bearer               | List messages in a session       |
| `PATCH`  | `/sessions/:sessionId`          | Bearer               | Rename or clear a title          |
| `DELETE` | `/sessions/:sessionId`          | Bearer               | Delete a session                 |
| `GET`    | `/knowledge-bases`              | Bearer               | Knowledge bases from neuxus      |
| `POST`   | `/remember`                     | Bearer               | Store a personal memory          |
| `POST`   | `/query`                        | Bearer               | Ask via neuxus `/v1/messages`    |
| `POST`   | `/query/stream`                 | Bearer               | Same, streamed as SSE events     |
| `GET`    | `/log/settings`                 | Bearer (admin)       | Read log sink settings           |
| `PUT`    | `/log/settings`                 | Bearer (admin)       | Update log sink settings         |
| `POST`   | `/log/settings/reset`           | Bearer (admin)       | Reset log settings               |
| `POST`   | `/log/purge`                    | Bearer (admin)       | Delete all `app_log` rows        |

The service token is for calling `apps/api`, not for authenticating chat users.
Chat users authenticate with their own API keys.
