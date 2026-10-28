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
