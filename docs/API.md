# Bun HTTP API

Base URL: `http://localhost:3001` (override with `PORT`).

All JSON responses use `Content-Type: application/json`. Corpus sync events are SSE (`text/event-stream`).

## Auth

| Endpoint                                                                | Auth                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| `GET /health`                                                           | none                                                |
| `GET /users`, `GET /users/:id`                                          | none (sandbox convenience)                          |
| `GET /users/:id/data`                                                   | `Authorization: Bearer <api-key>`                   |
| `DELETE /users/:id/memories/:memoryId`                                  | `Authorization: Bearer <api-key>`                   |
| `GET /sessions`, `POST /sessions`, `PATCH /sessions/:id`                | `Authorization: Bearer <api-key>`                   |
| `POST /users`                                                           | Bearer if any users exist; open when table is empty |
| `PATCH /users/:id`, `DELETE /users/:id`                                 | `Authorization: Bearer <api-key>`                   |
| `POST /query`, `POST /remember`                                         | `Authorization: Bearer <api-key>`                   |
| `GET /server-setting/embed`, `PUT /server-setting/embed`                | Bearer **admin**                                    |
| `POST /server-setting/embed/reset`                                      | Bearer **admin**                                    |
| `GET /server-setting/synthesis`, `PUT /server-setting/synthesis`        | Bearer **admin**                                    |
| `POST /server-setting/synthesis/reset`                                  | Bearer **admin**                                    |
| `GET /server-setting/corpus`, `PUT /server-setting/corpus`              | Bearer **admin**                                    |
| `POST /server-setting/corpus/clone`, `POST /server-setting/corpus/pull` | Bearer **admin**                                    |
| `POST /server-setting/corpus/sync`                                      | Bearer **admin**                                    |
| `GET /server-setting/corpus/sync/events`                                | Bearer **admin**                                    |
| `POST /server-setting/nuke`                                             | Bearer **admin**                                    |

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

`GET /server-setting/embed` — stored `kb_embed_settings` (`null` stays `null`) plus `defaults` (hardcoded app values). Bearer admin.

`PUT /server-setting/embed` body: same fields as today. Empty / `null` store as null (runtime still uses `defaults`).

`POST /server-setting/embed/reset` — writes hardcoded `defaults` into the row (`nomic-embed-text:latest`, `ollama`, `127.0.0.1`, `11434`, `apiKey` null). Non-admin → `403`.

### Synthesis settings (admin)

`GET /server-setting/synthesis` — stored `app_synthesis_settings` (`null` stays `null`) plus `defaults`. Bearer admin.

`PUT /server-setting/synthesis` body: same fields as today. Empty / `null` store as null.

`POST /server-setting/synthesis/reset` — writes hardcoded `defaults` (`minimax`, `MiniMax-M3`, `https://api.minimaxi.com/anthropic`, `maxTokens` 4096, `contextWindowTokens` 1000000, `apiKey` null). Unknown model with no `contextWindowTokens` still resolves to `0` on the Ask path. Non-admin → `403`. Do not log `apiKey`.

### Corpus settings (admin)

`GET /server-setting/corpus` — stored `kb_corpus_settings` (`null` stays `null`). Bearer admin.

`PUT /server-setting/corpus` body:

```json
{
  "repoUrl": "https://github.com/org/kb.git",
  "branch": "main",
  "docsRoot": "docs"
}
```

Empty / `null` fields store as null. Null `repoUrl` means do not clone. `lastSyncedSha` is read-only (clone, pull, and a finished Sync write it). Non-admin → `403`.

`POST /server-setting/corpus/clone` — `git clone` saved `repoUrl` into `apps/api/data/corpus`. Optional saved `branch`. 409 if already cloned.

`POST /server-setting/corpus/pull` — `git fetch` + `git pull --ff-only` in that checkout. 400 if not cloned yet.

Both return the stored corpus settings (including `lastSyncedSha`). Uses the last **saved** row, not unsaved form fields. Bearer admin. Git must be on `PATH`. SSH uses the API process user’s keys.

`POST /server-setting/corpus/sync` — start a background singleton Sync: clone-if-missing else pull, walk `docs_root`, ingest/chunkify/persist (hash skip), delete missing `source_path` rows, embed stale children, then write `last_synced_sha` from `HEAD`. Returns **202** `{ "ok": true }`. Second concurrent Sync → **409**. Fail-fast; no job table. In-process lock (one API process).

`GET /server-setting/corpus/sync/events` — stay-open SSE. Snapshot on connect, then `{ "running": boolean, "stage": "pull"|"ingest"|"embed"|null, "lastError": string|null }`. Comment pings keep the socket alive. Use `fetch` with `Authorization` (the browser `EventSource` API cannot set Bearer). Non-admin → `403`.

## Env

| Variable       | Purpose                               |
| -------------- | ------------------------------------- |
| `DATABASE_URL` | Postgres URL (database name `neuxus`) |
| `PORT`         | API port (default 3001)               |

Ask synthesis (MiniMax key, model, base URL, window) is `app_synthesis_settings`, not env. Corpus git remote is `kb_corpus_settings`, not env.
