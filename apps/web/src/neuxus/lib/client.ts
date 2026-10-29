import { type ApiInit, requestJson } from "@/shared/lib/http";

export { ApiError } from "@/shared/lib/http";

const DEFAULT_API_URL = "http://localhost:3001";

export function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
}

export function apiFetch<T>(path: string, init?: ApiInit): Promise<T> {
  return requestJson<T>(apiBaseUrl(), path, {
    ...init,
    authHeader: "x-api-key",
  });
}
