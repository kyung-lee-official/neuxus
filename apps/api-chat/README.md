# apps/api-chat

Stateful chat adapter for neuxus. It owns end-user identity, chat sessions,
messages, and personal memory. The chat dialog is being refactored: `/query` is
a stub until the call to the stateless neuxus API is wired.

## Responsibilities

- User accounts and API-key auth
- Chat sessions and messages
- Personal memory (`/remember`)
- User data export
- Chat dialog (stub, `/query` returns `501`)
- Calls the neuxus API over HTTP in a later phase
  (`NEUXUS_API_URL`, `NEUXUS_SERVICE_TOKEN`)

It does not own knowledge, model providers, logs, or server settings. Those
belong to `apps/api`.

## Stack

| Piece                    | Role                                |
| ------------------------ | ----------------------------------- |
| Bun + Elysia             | HTTP API on `:3002`                 |
| Postgres (`neuxus-chat`) | Users, memories, sessions, messages |
| Prisma                   | Schema and migrations               |
| User API keys            | `Authorization: Bearer <api-key>`   |
| `apps/web`               | Chat UI at `/chat`                  |

The chat database is separate from the neuxus database. Do not import code from
`apps/api`; call it over HTTP.

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
| `GET`    | `/users/:id/logs`               | Bearer               | User logs (empty stub for now)   |
| `DELETE` | `/users/:id/memories/:memoryId` | Bearer               | Delete a memory                  |
| `GET`    | `/sessions`                     | Bearer               | List the current user's sessions |
| `POST`   | `/sessions`                     | Bearer               | Create a session                 |
| `PATCH`  | `/sessions/:sessionId`          | Bearer               | Rename or clear a title          |
| `DELETE` | `/sessions/:sessionId`          | Bearer               | Delete a session                 |
| `POST`   | `/remember`                     | Bearer               | Store a personal memory          |
| `POST`   | `/query`                        | Bearer               | Chat stub, returns `501`         |

The service token is for calling `apps/api`, not for authenticating chat users.
Chat users authenticate with their own API keys.
