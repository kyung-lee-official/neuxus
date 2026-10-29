export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiInit = RequestInit & { apiKey?: string };

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: ApiInit,
): Promise<T> {
  const { apiKey, headers: initHeaders, ...rest } = init ?? {};
  const headers = new Headers(initHeaders);
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
  if (rest.body && !headers.has("Content-Type")) {
    if (rest.body instanceof FormData) {
      // FormData sets its own multipart Content-Type with boundary.
    } else {
      headers.set("Content-Type", "application/json");
    }
  }

  const res = await fetch(`${baseUrl}${path}`, {
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
