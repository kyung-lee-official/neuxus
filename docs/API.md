# Bun HTTP API

Base URL: `http://localhost:3001` (override with `PORT`).

All responses are JSON (`Content-Type: application/json`).

## Auth

| Endpoint                                                 | Auth                                                |
| -------------------------------------------------------- | --------------------------------------------------- |
| `GET /health`                                            | none                                                |
| `GET /users`, `GET /users/:id`                           | none (sandbox convenience)                          |
| `GET /users/:id/data`                                    | `Authorization: Bearer <api-key>`                   |
| `DELETE /users/:id/memories/:memoryId`                   | `Authorization: Bearer <api-key>`                   |
| `GET /sessions`, `POST /sessions`, `PATCH /sessions/:id` | `Authorization: Bearer <api-key>`                   |
| `POST /users`                                            | Bearer if any users exist; open when table is empty |
| `PATCH /users/:id`, `DELETE /users/:id`                  | `Authorization: Bearer <api-key>`                   |
| `POST /query`, `POST /remember`                          | `Authorization: Bearer <api-key>`                   |
| `GET /server-setting/embed`, `PUT /server-setting/embed` | Bearer **admin**                                    |
| `POST /server-setting/nuke`                              | Bearer **admin**                                    |

Seed users (after `bun run seed`; stored in `app_users`):

| User id    | Role   | Default API key     |
| ---------- | ------ | ------------------- |
| `haewon`   | admin  | `demo-key-haewon`   |
| `lily`     | member | `demo-key-lily`     |
| `sullyoon` | member | `demo-key-sullyoon` |
| `bae`      | member | `demo-key-bae`      |
| `jiwoo`    | member | `demo-key-jiwoo`    |
| `kyujin`   | member | `demo-key-kyujin`   |

Missing or unknown key → `401`:

```json
{ "error": "Unauthorized. Use Authorization: Bearer <api-key>." }
```

## Endpoints

### `GET /health`

Liveness check. No auth.

**200**

```json
{ "ok": true }
```

### `POST /server-setting/nuke`

Admin Bearer. Hard-wipe `public` on **`DATABASE_URL`** (including extensions). Does **not** remigrate or seed.

**Request**

```json
{ "target": "app" }
```

**200**

```json
{ "ok": true, "nuked": true, "target": "app" }
```

**400** — missing/invalid `target` (only `"app"` is accepted). Non-admin → `403`.

### Users

`GET /users` → `{ "users": [ { "id", "apiKey", "role", "createdAt" } ] }`

`POST /users` body `{ "id", "apiKey?" }` — first user in an empty DB is `admin`, later users are `member`.

`GET|PATCH|DELETE /users/:id` — PATCH regenerates or sets `apiKey`.

`GET /users/:id/data?messagePage=` — memories, sessions, messages (Bearer).

`DELETE /users/:id/memories/:memoryId` — Bearer.

### Sessions

`GET /sessions`, `POST /sessions`, `PATCH /sessions/:id` with `{ "title": string | null }` — Bearer.

### `POST /query`

Bearer. Body:

```json
{ "message": "…", "mode": "ask", "sessionId": "optional-uuid" }
```

`mode` is optional and must be `"ask"` when set. Uses personal memory + recent chat, then MiniMax synthesis. Writes user/assistant messages to the session.

**200**

```json
{
  "userId": "lily",
  "sessionId": "…",
  "mode": "ask",
  "answer": "…"
}
```

### `POST /remember`

Bearer. Body `{ "content": "…" }` — inserts a personal memory note.

### Embed settings (admin)

`GET /server-setting/embed` — resolved `kb_embed_settings` (app defaults filled in). Bearer admin.

`PUT /server-setting/embed` body:

```json
{
  "embeddingModel": "nomic-embed-text:latest",
  "provider": "ollama",
  "host": "127.0.0.1",
  "port": 11434,
  "apiKey": null
}
```

Empty / `null` fields store as null (app defaults on read). Non-admin → `403`.

## Env

| Variable       | Purpose                               |
| -------------- | ------------------------------------- |
| `DATABASE_URL` | Postgres URL (database name `neuxus`) |
| `PORT`         | API port (default 3001)               |

Ask synthesis (MiniMax key, model, base URL, window) is `app_synthesis_settings`, not env.
