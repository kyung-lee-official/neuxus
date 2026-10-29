import { chatFetch } from "./api-client";

export { ApiError, chatApiBaseUrl } from "./api-client";

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
  /** Page of the current user's own retrieve/synthesis logs. */
  MyLogs: (userId: string, cursor: string | null) =>
    ["users", userId, "logs", cursor] as const,
} as const;

export async function getHealth(): Promise<{ ok: boolean }> {
  return chatFetch<{ ok: boolean }>("/health");
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
