import { PrismaPg } from "@prisma/adapter-pg";
import { SQL } from "bun";
import { PrismaClient } from "../generated/prisma/client.ts";
import { requireDatabaseUrl } from "./config.ts";

export type AppUserRole = "admin" | "member";

export type AppUser = {
  id: string;
  api_key: string;
  role: AppUserRole;
  created_at?: Date;
};

let prisma: PrismaClient | null = null;

/** Process-wide Prisma client. Lazy-initialized; safe to import without a DB. */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaPg(requireDatabaseUrl());
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/** Normalize a raw role string from the DB to the `"admin" | "member"` union. */
function normalizeRole(role: string): AppUserRole {
  return role === "admin" ? "admin" : "member";
}

function mapUser(row: {
  id: string;
  apiKey: string;
  role: string;
  createdAt: Date | null;
}): AppUser {
  return {
    id: row.id,
    api_key: row.apiKey,
    role: normalizeRole(row.role),
    created_at: row.createdAt ?? undefined,
  };
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

export async function upsertUser(user: AppUser): Promise<AppUser> {
  const row = await getPrisma().user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      apiKey: user.api_key,
      role: user.role,
    },
    update: {
      apiKey: user.api_key,
      role: user.role,
    },
  });
  return mapUser(row);
}

export async function listUsers(): Promise<AppUser[]> {
  const rows = await getPrisma().user.findMany({ orderBy: { id: "asc" } });
  return rows.map(mapUser);
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const row = await getPrisma().user.findUnique({ where: { id } });
  return row ? mapUser(row) : null;
}

export async function createUser(
  id: string,
  apiKey: string,
  role: AppUserRole = "member",
): Promise<AppUser> {
  const row = await getPrisma().user.create({
    data: { id, apiKey, role },
  });
  return mapUser(row);
}

export async function updateUserApiKey(
  id: string,
  apiKey: string,
): Promise<AppUser | null> {
  try {
    const row = await getPrisma().user.update({
      where: { id },
      data: { apiKey },
    });
    return mapUser(row);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return null;
    }
    throw err;
  }
}

export async function deleteUser(id: string): Promise<boolean> {
  try {
    await getPrisma().user.delete({ where: { id } });
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return false;
    }
    throw err;
  }
}

export async function countUsers(): Promise<number> {
  return getPrisma().user.count();
}

export async function getUserByApiKey(apiKey: string): Promise<AppUser | null> {
  const row = await getPrisma().user.findUnique({ where: { apiKey } });
  return row ? mapUser(row) : null;
}
