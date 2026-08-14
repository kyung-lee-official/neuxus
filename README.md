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

Ask mode retrieves knowledge-base parents, then synthesizes with MiniMax (config in `app_synthesis_settings`).

## Setup

1. Create the database:

```sql
CREATE DATABASE neuxus;
```

2. Copy env and set `DATABASE_URL`:

```powershell
Copy-Item .env.example .env
# edit DATABASE_URL
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

4. Dev:

```powershell
bun run dev
```

- API: http://localhost:3001
- Web: http://localhost:3000

## Seed users

| User id                                      | Role   | Default API key   |
| -------------------------------------------- | ------ | ----------------- |
| `haewon`                                     | admin  | `demo-key-haewon` |
| `lily`, `sullyoon`, `bae`, `jiwoo`, `kyujin` | member | `demo-key-<id>`   |

Without seed, the **first** created account becomes `admin`; later accounts are `member`.

## Docs

- [`docs/API.md`](docs/API.md) — HTTP API
- [`docs/modern-knowledge-base-design/`](docs/modern-knowledge-base-design/) — design notes (future KB)
