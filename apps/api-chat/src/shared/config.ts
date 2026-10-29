export function serverPort(): number {
  const raw = process.env.PORT ?? "3002";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) return 3002;
  return port;
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "";
}

export function requireDatabaseUrl(): string {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL (e.g. postgresql://host/neuxus-chat).",
    );
  }
  return url;
}

/** Base URL of the stateless neuxus API. */
export function neuxusApiUrl(): string {
  return (
    process.env.NEUXUS_API_URL?.trim() || "http://localhost:3001"
  ).replace(/\/$/, "");
}

/** Service token the chat app uses when calling neuxus. */
export function neuxusServiceToken(): string {
  return process.env.NEUXUS_SERVICE_TOKEN?.trim() || "";
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
