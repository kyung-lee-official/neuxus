# neuxus

Turborepo monorepo for the stateless neuxus API, the stateful chat adapter, and
the Next.js UI.

```text
neuxus/
├── apps/
│   ├── api/                 # stateless neuxus API (@neuxus/api) :3001
│   ├── api-chat/            # stateful chat adapter (@neuxus/api-chat) :3002
│   └── web/                 # Next.js UI (@neuxus/web) :3000
├── packages/
│   └── typescript-config/
└── docs/
```

## Stack

| Piece                    | Role                                                 |
| ------------------------ | ---------------------------------------------------- |
| Postgres (`neuxus`)      | Knowledge, model providers, logs, settings           |
| Postgres (`neuxus-chat`) | Users, memories, sessions, messages                  |
| `apps/api`               | Service-token API: knowledge, models, logs, settings |
| `apps/api-chat`          | User API keys, sessions, memory, chat adapter        |
| `apps/web`               | `/neuxus` settings UI and `/chat` UI                 |
| Model providers          | Embedding and synthesis models, configured in the UI |

The chat dialog is being refactored; `/query` currently returns `501`. See
[apps/api-chat/README.md](apps/api-chat/README.md).

## Setup

1. Create the neuxus database:

```sql
CREATE DATABASE neuxus;
```

2. Create the env files for the neuxus API and web UI:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
# edit DATABASE_URL if your local Postgres differs
```

3. Install and migrate the neuxus API:

```powershell
bun install
cd apps/api
bun run prisma:generate
bun run prisma -- migrate dev --name init
cd ../..
```

The neuxus core has no seed data; configure it through its settings and corpus
ingestion. For the chat database, migrations, seed users, and API surface, see
[apps/api-chat/README.md](apps/api-chat/README.md).

4. Dev:

```powershell
bun run dev
```

- neuxus API: http://localhost:3001
- Chat API: http://localhost:3002
- Web: http://localhost:3000
- OpenAPI (neuxus): http://localhost:3001/openapi
- OpenAPI (chat): http://localhost:3002/openapi
- OpenAPI spec (neuxus): http://localhost:3001/openapi/json

## Docs

- [PROTOCOL.md](PROTOCOL.md) — stateless neuxus / client app protocol
- [apps/api-chat/README.md](apps/api-chat/README.md) — chat adapter setup, seed users, API
- [OpenAPI (Scalar)](http://localhost:3001/openapi) — interactive HTTP API reference, generated from each route's TypeBox schema
- [`docs/modern-knowledge-base-design/`](docs/modern-knowledge-base-design/) — KB pipeline (corpus → ingest → chunkify → embed; query → synthesis)
