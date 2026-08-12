export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const DEFAULT_API_URL = "http://localhost:3132";

export function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { apiKey?: string },
): Promise<T> {
  const { apiKey, headers: initHeaders, ...rest } = init ?? {};
  const headers = new Headers(initHeaders);
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...rest,
    headers,
    cache: "no-store",
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}
