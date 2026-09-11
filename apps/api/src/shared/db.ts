import { PrismaPg } from "@prisma/adapter-pg";
import { SQL } from "bun";
import { PrismaClient } from "../generated/prisma/client.ts";
import { requireDatabaseUrl } from "./config.ts";

let prisma: PrismaClient | null = null;

/** Process-wide Prisma client. Lazy-initialized; safe to import without a DB. */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaPg(requireDatabaseUrl());
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

let sqlPool: SQL | null = null;

/**
 * Open (once) a dedicated Postgres pool used by `wipePublicSchema`.
 * The rest of the codebase uses Bun's built-in `sql` singleton directly.
 */
function wipePool(): SQL {
  if (!sqlPool) {
    sqlPool = new SQL({ url: requireDatabaseUrl(), max: 1 });
  }
  return sqlPool;
}

/** Close both Prisma and the wipe-only pool. Idempotent. */
export async function closeDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  if (sqlPool) {
    await sqlPool.close({ timeout: 5 });
    sqlPool = null;
  }
}

export type NukeTarget = "app";

/**
 * Hard-wipe `public` (tables, types, extensions). No remigrate. Runs
 * DDL outside Prisma — Prisma does not model extension drops or
 * schema-level operations.
 */
async function wipePublicSchema(connectionString: string): Promise<void> {
  const s = new SQL({ url: connectionString, max: 1 });
  try {
    // Drop non-core extensions first (e.g. vector), then the whole public schema.
    await s.unsafe(`
      DO $wipe$
      DECLARE
        ext record;
      BEGIN
        FOR ext IN
          SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'
        LOOP
          EXECUTE format('DROP EXTENSION IF EXISTS %I CASCADE', ext.extname);
        END LOOP;
      END
      $wipe$;
    `);
    await s.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await s.unsafe("CREATE SCHEMA public");
    await s.unsafe("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await s.unsafe("GRANT ALL ON SCHEMA public TO public");
  } finally {
    await s.close({ timeout: 5 });
  }
}

/** Wipe the neuxus database `public` schema. Recreate via Prisma migrate. */
export async function nukeDatabases(target: NukeTarget): Promise<void> {
  if (target !== "app") {
    throw new Error("Only target 'app' is supported");
  }
  await closeDb();
  await wipePublicSchema(requireDatabaseUrl());
}
