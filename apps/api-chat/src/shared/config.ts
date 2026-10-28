export function serverPort(): number {
  const raw = process.env.PORT ?? "3002";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) return 3002;
  return port;
}
