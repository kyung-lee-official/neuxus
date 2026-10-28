# neuxus

Turborepo monorepo: Bun HTTP API (`apps/api`) with personal memory and chat sessions in Postgres, plus a Next.js UI (`apps/web`).

```text
neuxus/
├── apps/
│   ├── api/                 # Bun + Elysia API (@neuxus/api) :3001
│   └── web/                 # Next.js UI (@neuxus/web) :3000
├── packages/
│   └── typescript-config/
└── docs/
```

## Stack

| Piece               | Role                                |
| ------------------- | ----------------------------------- |
| Postgres (`neuxus`) | Users, memories, sessions, messages |
| Bun API             | Auth (API keys), chat ask, CRUD     |
| MiniMax             | Ask-mode LLM synthesis              |
| Next.js             | Sign-in, chat UI, settings          |

Ask mode retrieves knowledge-base parents, then synthesizes with the model linked to the `text-synthesis` task (`app_model_task_config`).

## Setup

1. Create the databases:

```sql
CREATE DATABASE neuxus;
CREATE DATABASE "neuxus-chat";
```

2. Create per-app env files:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/api-chat/.env.example apps/api-chat/.env
Copy-Item apps/web/.env.example apps/web/.env.local
# edit the DATABASE_URLs if your local Postgres differs
```

3. Install and migrate (from `apps/api`):

```powershell
bun install
cd apps/api
bun run prisma:generate
bun run prisma -- migrate dev --name init
cd ../..
bun run seed
```

`apps/api-chat` is a stub and has no Prisma schema/migrations yet; its database is
created now for the upcoming chat layer.

4. Dev:

```powershell
bun run dev
```

- API: http://localhost:3001
- Chat API: http://localhost:3002
- Web: http://localhost:3000
- OpenAPI docs (Scalar): http://localhost:3001/openapi
- Chat OpenAPI docs: http://localhost:3002/openapi
- OpenAPI spec (JSON): http://localhost:3001/openapi/json

## Seed users

| User id                                      | Role   | Default API key   |
| -------------------------------------------- | ------ | ----------------- |
| `haewon`                                     | admin  | `demo-key-haewon` |
| `lily`, `sullyoon`, `bae`, `jiwoo`, `kyujin` | member | `demo-key-<id>`   |

Without seed, the **first** created account becomes `admin`; later accounts are `member`.

## Docs

- [PROTOCOL.md](PROTOCOL.md) — stateless core / client app protocol
- [OpenAPI (Scalar)](http://localhost:3001/openapi) — interactive HTTP API reference, generated from each route's TypeBox schema
- [`docs/modern-knowledge-base-design/`](docs/modern-knowledge-base-design/) — KB pipeline (corpus → ingest → chunkify → embed; query → synthesis)
