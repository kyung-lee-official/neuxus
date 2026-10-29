import { type ApiInit, requestJson } from "@/shared/lib/http";

export { ApiError } from "@/shared/lib/http";

const DEFAULT_CHAT_API_URL = "http://localhost:3002";

export function chatApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CHAT_API_URL?.trim() ||
    process.env.CHAT_API_URL?.trim() ||
    DEFAULT_CHAT_API_URL
  ).replace(/\/$/, "");
}

export function chatFetch<T>(path: string, init?: ApiInit): Promise<T> {
  return requestJson<T>(chatApiBaseUrl(), path, init);
}
