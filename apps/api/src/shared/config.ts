/** Single Postgres database for this app (`neuxus`). */
export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "";
}

export function requireDatabaseUrl(): string {
  const url = databaseUrl();
  if (!url) {
    throw new Error("Missing DATABASE_URL (e.g. postgresql://…/neuxus).");
  }
  return url;
}

export function serverPort(): number {
  const raw = process.env.PORT ?? "3132";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) return 3132;
  return port;
}

/** Seeded into `app_users` by `bun run seed` (ids are lowercase; `haewon` is admin). */
export const SEED_USER_IDS = [
  "lily",
  "haewon",
  "sullyoon",
  "bae",
  "jiwoo",
  "kyujin",
] as const;

export type SeedUserId = (typeof SEED_USER_IDS)[number];

export function apiKeyForSeedUser(id: string): string {
  return `demo-key-${id}`;
}
