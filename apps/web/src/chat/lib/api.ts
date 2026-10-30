import { ApiError, chatApiBaseUrl, chatFetch } from "./client";

export { ApiError, chatApiBaseUrl } from "./client";

export type AskMode = "ask";

export type ApiUser = {
  id: string;
  apiKey: string;
  role: "admin" | "member";
  createdAt?: string | null;
};

export type QueryResult = {
  userId?: string;
  sessionId?: string;
  mode?: AskMode;
  answer?: string;
};

export type RememberResult = {
  userId?: string;
  slug?: string;
  saved?: boolean;
};

export type ChatKnowledgeBase = {
  id: string;
  name: string;
  writable: boolean;
  createdAt: string | null;
};

export type ChatMessageRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string | null;
};

export type UserMemoryRow = {
  id: number;
  slug: string;
  content: string;
  createdAt: string | null;
};

export type UserSessionRow = {
  id: string;
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UserMessageRow = {
  id: number;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string | null;
};

export type UserMessagesPage = {
  items: UserMessageRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type UserDataDump = {
  user: ApiUser;
  memories: UserMemoryRow[];
  sessions: UserSessionRow[];
  messages: UserMessagesPage;
};

function normalizeMessagesPage(
  raw: UserMessagesPage | UserMessageRow[] | undefined,
  page: number,
): UserMessagesPage {
  if (Array.isArray(raw)) {
    return {
      items: raw,
      total: raw.length,
      page,
      pageSize: Math.max(raw.length, 50),
    };
  }
  if (raw && Array.isArray(raw.items)) {
    return {
      items: raw.items,
      total: typeof raw.total === "number" ? raw.total : raw.items.length,
      page: typeof raw.page === "number" ? raw.page : page,
      pageSize: typeof raw.pageSize === "number" ? raw.pageSize : 50,
    };
  }
  return { items: [], total: 0, page, pageSize: 50 };
}

export const UserQueryKey = {
  List: ["users"] as const,
  Health: ["health"] as const,
  /** Prefix for all pages of a user's DB dump (use for invalidateQueries). */
  DataRoot: (id: string) => ["users", id, "data"] as const,
  Data: (id: string, messagePage: number) =>
    ["users", id, "data", messagePage] as const,
  Sessions: (userId: string) => ["sessions", userId] as const,
  SessionMessages: (sessionId: string) =>
    ["sessions", sessionId, "messages"] as const,
  KnowledgeBases: ["chat", "knowledge-bases"] as const,
  AgentSettings: ["agent-settings"] as const,
  /** Page of the current user's own retrieve/synthesis logs. */
  MyLogs: (userId: string, cursor: string | null) =>
    ["users", userId, "logs", cursor] as const,
} as const;

export async function getHealth(): Promise<{ ok: boolean }> {
  return chatFetch<{ ok: boolean }>("/health");
}

export async function listChatKnowledgeBases(
  apiKey: string,
): Promise<ChatKnowledgeBase[]> {
  const data = await chatFetch<{ knowledgeBases: ChatKnowledgeBase[] }>(
    "/knowledge-bases",
    { apiKey },
  );
  return data.knowledgeBases ?? [];
}

export async function listSessionMessages(input: {
  apiKey: string;
  sessionId: string;
}): Promise<ChatMessageRow[]> {
  const data = await chatFetch<{ messages: ChatMessageRow[] }>(
    `/sessions/${encodeURIComponent(input.sessionId)}/messages`,
    { apiKey: input.apiKey },
  );
  return data.messages ?? [];
}

export type MyLogItem = {
  id: string;
  level: string;
  msg: string;
  name: string | null;
  userId: string | null;
  meta: unknown;
  createdAt: string;
};

export type MyLogsPage = {
  items: MyLogItem[];
  nextCursor: string | null;
};

export async function getMyLogs(input: {
  apiKey: string;
  userId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<MyLogsPage> {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const qs = params.toString();
  return chatFetch<MyLogsPage>(
    `/users/${encodeURIComponent(input.userId)}/logs${qs ? `?${qs}` : ""}`,
    {
      apiKey: input.apiKey,
    },
  );
}

export async function listUsers(): Promise<ApiUser[]> {
  const data = await chatFetch<{ users: ApiUser[] }>("/users");
  return data.users ?? [];
}

export async function createUser(input: {
  id: string;
  apiKey?: string;
  actorApiKey: string | null;
}): Promise<ApiUser> {
  return chatFetch<ApiUser>("/users", {
    method: "POST",
    apiKey: input.actorApiKey ?? undefined,
    body: JSON.stringify({
      id: input.id,
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    }),
  });
}

export async function regenerateUserKey(input: {
  id: string;
  actorApiKey: string;
}): Promise<ApiUser> {
  return chatFetch<ApiUser>(`/users/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    apiKey: input.actorApiKey,
    body: JSON.stringify({}),
  });
}

export async function deleteUser(input: {
  id: string;
  actorApiKey: string;
}): Promise<{ deleted: boolean; id: string }> {
  return chatFetch<{ deleted: boolean; id: string }>(
    `/users/${encodeURIComponent(input.id)}`,
    {
      method: "DELETE",
      apiKey: input.actorApiKey,
    },
  );
}

export async function getUserData(input: {
  id: string;
  apiKey: string;
  messagePage?: number;
}): Promise<UserDataDump> {
  const page = input.messagePage ?? 1;
  const qs = page > 1 ? `?messagePage=${page}` : "";
  const data = await chatFetch<{
    user: ApiUser;
    memories: UserMemoryRow[];
    sessions: UserSessionRow[];
    messages: UserMessagesPage | UserMessageRow[];
  }>(`/users/${encodeURIComponent(input.id)}/data${qs}`, {
    apiKey: input.apiKey,
  });
  return {
    ...data,
    memories: data.memories ?? [],
    sessions: data.sessions ?? [],
    messages: normalizeMessagesPage(data.messages, page),
  };
}

export async function deleteUserMemory(input: {
  userId: string;
  memoryId: number;
  apiKey: string;
}): Promise<{ deleted: boolean; id: number }> {
  return chatFetch<{ deleted: boolean; id: number }>(
    `/users/${encodeURIComponent(input.userId)}/memories/${input.memoryId}`,
    {
      method: "DELETE",
      apiKey: input.apiKey,
    },
  );
}

export async function listSessions(apiKey: string): Promise<UserSessionRow[]> {
  const data = await chatFetch<{ sessions: UserSessionRow[] }>("/sessions", {
    apiKey,
  });
  return data.sessions ?? [];
}

export async function createSession(apiKey: string): Promise<UserSessionRow> {
  return chatFetch<UserSessionRow>("/sessions", {
    method: "POST",
    apiKey,
  });
}

export async function patchSessionTitle(input: {
  apiKey: string;
  sessionId: string;
  title: string | null;
}): Promise<UserSessionRow> {
  return chatFetch<UserSessionRow>(
    `/sessions/${encodeURIComponent(input.sessionId)}`,
    {
      method: "PATCH",
      apiKey: input.apiKey,
      body: JSON.stringify({ title: input.title }),
    },
  );
}

export async function deleteSession(input: {
  apiKey: string;
  sessionId: string;
}): Promise<{ deleted: boolean; id: string }> {
  return chatFetch<{ deleted: boolean; id: string }>(
    `/sessions/${encodeURIComponent(input.sessionId)}`,
    {
      method: "DELETE",
      apiKey: input.apiKey,
    },
  );
}

export async function postQuery(input: {
  apiKey: string;
  message: string;
  mode: AskMode;
  knowledgeBaseId: string;
  sessionId?: string | null;
}): Promise<QueryResult> {
  return chatFetch<QueryResult>("/query", {
    method: "POST",
    apiKey: input.apiKey,
    body: JSON.stringify({
      message: input.message,
      mode: input.mode,
      knowledgeBaseId: input.knowledgeBaseId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    }),
  });
}

export type QueryStreamEvent =
  | { type: "start"; sessionId: string; userId: string }
  | { type: "delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      isError: boolean;
      preview: string;
    }
  | { type: "done"; sessionId: string; userId: string }
  | { type: "error"; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseQueryEvent(block: string): QueryStreamEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (data === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
  if (parsed.type === "delta" && typeof parsed.text === "string") {
    return { type: "delta", text: parsed.text };
  }
  if (
    (parsed.type === "start" || parsed.type === "done") &&
    typeof parsed.sessionId === "string" &&
    typeof parsed.userId === "string"
  ) {
    return {
      type: parsed.type,
      sessionId: parsed.sessionId,
      userId: parsed.userId,
    };
  }
  if (parsed.type === "error" && typeof parsed.error === "string") {
    return { type: "error", error: parsed.error };
  }
  if (
    parsed.type === "tool_call" &&
    typeof parsed.id === "string" &&
    typeof parsed.name === "string" &&
    isRecord(parsed.input)
  ) {
    return {
      type: "tool_call",
      id: parsed.id,
      name: parsed.name,
      input: parsed.input,
    };
  }
  if (
    parsed.type === "tool_result" &&
    typeof parsed.id === "string" &&
    typeof parsed.name === "string" &&
    typeof parsed.isError === "boolean" &&
    typeof parsed.preview === "string"
  ) {
    return {
      type: "tool_result",
      id: parsed.id,
      name: parsed.name,
      isError: parsed.isError,
      preview: parsed.preview,
    };
  }
  return null;
}

function responseError(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      if (typeof parsed.error === "string") return parsed.error;
      if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
        return parsed.error.message;
      }
    }
  } catch {
    /* non-JSON response */
  }
  return raw.trim() || `HTTP ${status}`;
}

/** Consume the `/query/stream` SSE response. */
export async function streamQuery(input: {
  apiKey: string;
  message: string;
  knowledgeBaseId: string;
  sessionId?: string | null;
  signal?: AbortSignal;
  onEvent: (event: QueryStreamEvent) => void;
}): Promise<void> {
  const res = await fetch(`${chatApiBaseUrl()}/query/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: input.message,
      mode: "ask",
      knowledgeBaseId: input.knowledgeBaseId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    }),
    signal: input.signal,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(responseError(await res.text(), res.status), res.status);
  }
  if (!res.body) throw new ApiError("No event stream", 502);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const consume = (block: string) => {
    const event = parseQueryEvent(block);
    if (!event) return;
    if (event.type === "error") {
      throw new ApiError(event.error, 502);
    }
    if (event.type === "done") finished = true;
    input.onEvent(event);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer);
        if (!match || match.index === undefined) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        consume(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") consume(buffer);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  if (!finished) {
    throw new ApiError("Stream ended before completion", 502);
  }
}

export async function postRemember(input: {
  apiKey: string;
  content: string;
}): Promise<RememberResult> {
  return chatFetch<RememberResult>("/remember", {
    method: "POST",
    apiKey: input.apiKey,
    body: JSON.stringify({ content: input.content }),
  });
}

export type ChatAgentSettings = {
  hasDeepseekApiKey: boolean;
  maxToolIterations: number;
  streamTimeoutMs: number;
  runMaxAttempts: number;
  defaults: {
    maxToolIterations: number;
    streamTimeoutMs: number;
    runMaxAttempts: number;
  };
};

export async function getChatAgentSettings(
  apiKey: string,
): Promise<ChatAgentSettings> {
  return chatFetch<ChatAgentSettings>("/agent-settings", { apiKey });
}

export async function putChatAgentSettings(input: {
  apiKey: string;
  settings: {
    deepseekApiKey?: string | null;
    maxToolIterations?: number | null;
    streamTimeoutMs?: number | null;
    runMaxAttempts?: number | null;
  };
}): Promise<ChatAgentSettings> {
  return chatFetch<ChatAgentSettings>("/agent-settings", {
    method: "PUT",
    apiKey: input.apiKey,
    body: JSON.stringify(input.settings),
  });
}
