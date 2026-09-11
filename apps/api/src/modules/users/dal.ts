/**
 * Users DAL. Owns the `app_users` table: lookup, creation, API-key rotation,
 * deletion, and role mapping.
 *
 * Internal: only `service.ts` imports this file. Other modules use `service.ts`.
 */

import { getPrisma } from "../../shared/db.ts";

export type AppUserRole = "admin" | "member";

export type AppUser = {
  id: string;
  api_key: string;
  role: AppUserRole;
  created_at?: Date;
};

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

/** Insert or update a user by id (used by seeding). */
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
