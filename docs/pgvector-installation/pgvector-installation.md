# pgvector installation

[pgvector](https://github.com/pgvector/pgvector) adds a `vector` type and distance operators to PostgreSQL. This project uses it on knowledge-base child embeddings (`kb_children.embedding`).

**Two steps:**

1. Install the **extension files** on the Postgres **server** (must match the server’s major version).
2. Enable the extension **inside** the target database.

`CREATE EXTENSION vector` fails until step 1 is done.

Official GitHub [Releases](https://github.com/pgvector/pgvector/releases) do **not** ship Windows (or generic) binaries. On a local Postgres install, **build from source** as the [upstream README](https://github.com/pgvector/pgvector#installation) describes. Docker images already include the build.

## Check Postgres version

```sql
SELECT version();
```

Use that major version (16, 17, 18, …) for `PGROOT`, package names, and Docker tags.

## Step 1 — extension files on the server

### Windows (installed PostgreSQL)

1. Install [Build Tools for Visual Studio 2026](https://visualstudio.microsoft.com/downloads/) (MSVC).
   Check **Desktop development with C++**, in the **Installation details** select **MSVC Build Tools for x64/x86 (Latest)** and **Windows 11 SDK**. Finish the install.
2. Open **x64 Native Tools Command Prompt for VS** **as Administrator**.
3. Point `PGROOT` at your Postgres install and build (tag `v0.8.6` is current in upstream docs — use a newer tag if you prefer):

   ```cmd
   set "PGROOT=C:\Program Files\PostgreSQL\18"
   cd %TEMP%
   git clone --branch v0.8.6 https://github.com/pgvector/pgvector.git
   cd pgvector
   nmake /F Makefile.win
   nmake /F Makefile.win install
   ```

4. Restart the PostgreSQL service.

`nmake /F Makefile.win install` copies `vector.dll`, `vector.control`, and `vector--*.sql` into `%PGROOT%\lib` and `%PGROOT%\share\extension`.

### Linux and macOS (compile)

```sh
cd /tmp
git clone --branch v0.8.6 https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
```

Some distros also ship packages (for example `postgresql-16-pgvector` on Debian/Ubuntu). See [pgvector installation](https://github.com/pgvector/pgvector#installation).

## Step 2 — enable in the database

Connect as a superuser (or a role allowed to create extensions) to the app database:

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
- After a Postgres major upgrade, rebuild/install pgvector for the new version and run `ALTER EXTENSION vector UPDATE;` if needed.
