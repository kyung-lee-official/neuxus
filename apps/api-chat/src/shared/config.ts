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

/** DeepSeek API key for chat-owned tools such as web fetch. */
export function deepseekApiKey(): string {
  return process.env.DEEPSEEK_API_KEY?.trim() || "";
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Maximum model/tool iterations in one agent run. */
export function chatMaxToolIterations(): number {
  return positiveIntEnv("CHAT_MAX_TOOL_ITERATIONS", 4);
}

/** Maximum wall-clock time for one streaming run. */
export function chatStreamTimeoutMs(): number {
  return positiveIntEnv("CHAT_STREAM_TIMEOUT_MS", 300_000);
}

/** Maximum attempts for a durable agent run before it is marked failed. */
export function chatRunMaxAttempts(): number {
  return positiveIntEnv("CHAT_RUN_MAX_ATTEMPTS", 2);
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
