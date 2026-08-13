# pgvector installation

[pgvector](https://github.com/pgvector/pgvector) adds a `vector` type and distance operators to PostgreSQL. This project uses it on knowledge-base child embeddings (`kb_children.embedding`).

**Two steps:**

1. Install the **extension files** on the Postgres **server** (must match the server’s major version).
2. Enable the extension **inside** the target database.

`CREATE EXTENSION vector` fails until step 1 is done.

## Check Postgres version

```sql
SELECT version();
```

Use that major version (16, 17, …) for packages, Docker tags, and Windows binaries.

## Step 1 — extension files on the server

### Docker

Use an image that already includes pgvector, with a tag that matches your Postgres major version:

```text
pgvector/pgvector:pg16
```

### Windows (installed PostgreSQL)

Official Windows builds are listed on [pgvector releases](https://github.com/pgvector/pgvector/releases). Pick the zip for your Postgres major version.

Copy into the Postgres install directory (typically `C:\Program Files\PostgreSQL\<major>\`):

| File             | Destination        |
| ---------------- | ------------------ |
| `vector.dll`     | `lib\`             |
| `vector.control` | `share\extension\` |
| `vector--*.sql`  | `share\extension\` |

Restart the PostgreSQL service.

Building from source on Windows is possible but heavy; prefer a prebuilt zip or Docker.

### Debian / Ubuntu

Package names include the Postgres major version:

```bash
sudo apt install postgresql-16-pgvector
```

Adjust `16` to match the server. Other distros: see [pgvector installation](https://github.com/pgvector/pgvector#installation).

## Step 2 — enable in the database

Connect as a superuser (or a role allowed to create extensions) to the app database (`neuxus` in this repo):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Confirm:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

Knowledge-base migrations that declare a `vector` column require this extension **before** they run.

## Notes

- Client tools (`psql`, Prisma, app code) do not install pgvector. Only the **server** does.
- Superuser is typically required for `CREATE EXTENSION`.
- After a Postgres major upgrade, reinstall pgvector for the new version and run `ALTER EXTENSION vector UPDATE;` if needed.
