import { ApiError, apiBaseUrl, apiFetch } from "./api-client";

export { ApiError, apiBaseUrl } from "./api-client";

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
  EmbedSettings: ["server-setting", "embed"] as const,
  SynthesisSettings: ["server-setting", "synthesis"] as const,
  CorpusSettings: ["server-setting", "corpus"] as const,
  KnowledgePages: ["knowledge", "pages"] as const,
  KnowledgePage: (id: string) => ["knowledge", "pages", id] as const,
} as const;

export async function getHealth(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/health");
}

export type NukeTarget = "app";

export async function nukeDatabase(input: {
  apiKey: string;
  target?: NukeTarget;
}): Promise<{ ok: boolean; nuked: boolean; target: NukeTarget }> {
  const target = input.target ?? "app";
  return apiFetch<{ ok: boolean; nuked: boolean; target: NukeTarget }>(
    "/server-setting/nuke",
    {
      method: "POST",
      apiKey: input.apiKey,
      body: JSON.stringify({ target }),
    },
  );
}

export async function listUsers(): Promise<ApiUser[]> {
  const data = await apiFetch<{ users: ApiUser[] }>("/users");
  return data.users ?? [];
}

export async function createUser(input: {
  id: string;
  apiKey?: string;
  actorApiKey: string | null;
}): Promise<ApiUser> {
  return apiFetch<ApiUser>("/users", {
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
  return apiFetch<ApiUser>(`/users/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    apiKey: input.actorApiKey,
    body: JSON.stringify({}),
  });
}

export async function deleteUser(input: {
  id: string;
  actorApiKey: string;
}): Promise<{ deleted: boolean; id: string }> {
  return apiFetch<{ deleted: boolean; id: string }>(
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
  const data = await apiFetch<{
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
  return apiFetch<{ deleted: boolean; id: number }>(
    `/users/${encodeURIComponent(input.userId)}/memories/${input.memoryId}`,
    {
      method: "DELETE",
      apiKey: input.apiKey,
    },
  );
}

export async function listSessions(apiKey: string): Promise<UserSessionRow[]> {
  const data = await apiFetch<{ sessions: UserSessionRow[] }>("/sessions", {
    apiKey,
  });
  return data.sessions ?? [];
}

export async function createSession(apiKey: string): Promise<UserSessionRow> {
  return apiFetch<UserSessionRow>("/sessions", {
    method: "POST",
    apiKey,
  });
}

export async function patchSessionTitle(input: {
  apiKey: string;
  sessionId: string;
  title: string | null;
}): Promise<UserSessionRow> {
  return apiFetch<UserSessionRow>(
    `/sessions/${encodeURIComponent(input.sessionId)}`,
    {
      method: "PATCH",
      apiKey: input.apiKey,
      body: JSON.stringify({ title: input.title }),
    },
  );
}

export async function postQuery(input: {
  apiKey: string;
  message: string;
  mode: AskMode;
  sessionId?: string | null;
}): Promise<QueryResult> {
  return apiFetch<QueryResult>("/query", {
    method: "POST",
    apiKey: input.apiKey,
    body: JSON.stringify({
      message: input.message,
      mode: input.mode,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    }),
  });
}

export async function postRemember(input: {
  apiKey: string;
  content: string;
}): Promise<RememberResult> {
  return apiFetch<RememberResult>("/remember", {
    method: "POST",
    apiKey: input.apiKey,
    body: JSON.stringify({ content: input.content }),
  });
}

export type EmbedSettings = {
  embeddingModel: string | null;
  provider: string | null;
  host: string | null;
  port: number | null;
  apiKey: string | null;
  defaults: {
    embeddingModel: string;
    provider: string;
    host: string;
    port: number;
    apiKey: string | null;
  };
};

export async function getEmbedSettings(apiKey: string): Promise<EmbedSettings> {
  return apiFetch<EmbedSettings>("/server-setting/embed", { apiKey });
}

export async function putEmbedSettings(input: {
  apiKey: string;
  settings: {
    embeddingModel: string | null;
    provider: string | null;
    host: string | null;
    port: number | null;
    apiKey: string | null;
  };
}): Promise<EmbedSettings> {
  return apiFetch<EmbedSettings>("/server-setting/embed", {
    method: "PUT",
    apiKey: input.apiKey,
    body: JSON.stringify(input.settings),
  });
}

export async function resetEmbedSettings(
  apiKey: string,
): Promise<EmbedSettings> {
  return apiFetch<EmbedSettings>("/server-setting/embed/reset", {
    method: "POST",
    apiKey,
  });
}

export type SynthesisSettings = {
  provider: string | null;
  synthesisModel: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  maxTokens: number | null;
  contextWindowTokens: number | null;
  defaults: {
    provider: string;
    synthesisModel: string;
    baseUrl: string;
    apiKey: string | null;
    maxTokens: number;
    contextWindowTokens: number;
  };
};

export async function getSynthesisSettings(
  apiKey: string,
): Promise<SynthesisSettings> {
  return apiFetch<SynthesisSettings>("/server-setting/synthesis", { apiKey });
}

export async function putSynthesisSettings(input: {
  apiKey: string;
  settings: {
    provider: string | null;
    synthesisModel: string | null;
    baseUrl: string | null;
    apiKey: string | null;
    maxTokens: number | null;
    contextWindowTokens: number | null;
  };
}): Promise<SynthesisSettings> {
  return apiFetch<SynthesisSettings>("/server-setting/synthesis", {
    method: "PUT",
    apiKey: input.apiKey,
    body: JSON.stringify(input.settings),
  });
}

export async function resetSynthesisSettings(
  apiKey: string,
): Promise<SynthesisSettings> {
  return apiFetch<SynthesisSettings>("/server-setting/synthesis/reset", {
    method: "POST",
    apiKey,
  });
}

export type CorpusSettings = {
  repoUrl: string | null;
  branch: string | null;
  docsRoot: string | null;
  lastSyncedSha: string | null;
};

export async function getCorpusSettings(
  apiKey: string,
): Promise<CorpusSettings> {
  return apiFetch<CorpusSettings>("/server-setting/corpus", { apiKey });
}

export async function putCorpusSettings(input: {
  apiKey: string;
  settings: {
    repoUrl: string | null;
    branch: string | null;
    docsRoot: string | null;
  };
}): Promise<CorpusSettings> {
  return apiFetch<CorpusSettings>("/server-setting/corpus", {
    method: "PUT",
    apiKey: input.apiKey,
    body: JSON.stringify(input.settings),
  });
}

export async function cloneCorpus(apiKey: string): Promise<CorpusSettings> {
  return apiFetch<CorpusSettings>("/server-setting/corpus/clone", {
    method: "POST",
    apiKey,
  });
}

export async function pullCorpus(apiKey: string): Promise<CorpusSettings> {
  return apiFetch<CorpusSettings>("/server-setting/corpus/pull", {
    method: "POST",
    apiKey,
  });
}

export type CorpusSyncStage = "pull" | "ingest" | "embed";

export type CorpusSyncStatus = {
  running: boolean;
  stage: CorpusSyncStage | null;
  lastError: string | null;
};

function parseCorpusSyncStatus(value: unknown): CorpusSyncStatus | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    running?: unknown;
    stage?: unknown;
    lastError?: unknown;
  };
  if (typeof row.running !== "boolean") return null;
  const stage = row.stage;
  if (
    stage !== null &&
    stage !== "pull" &&
    stage !== "ingest" &&
    stage !== "embed"
  ) {
    return null;
  }
  if (row.lastError !== null && typeof row.lastError !== "string") return null;
  return {
    running: row.running,
    stage,
    lastError: row.lastError,
  };
}

export async function startCorpusSync(apiKey: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/server-setting/corpus/sync", {
    method: "POST",
    apiKey,
  });
}

function consumeSseBuffer(
  buffer: string,
  onStatus: (status: CorpusSyncStatus) => void,
): string {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice("data:".length).trim();
      if (raw === "") continue;
      try {
        const parsed = parseCorpusSyncStatus(JSON.parse(raw) as unknown);
        if (parsed) onStatus(parsed);
      } catch {
        /* ignore a truncated JSON frame */
      }
    }
  }
  return rest;
}

/** Stay-open SSE via fetch (Bearer). Resolves when the stream ends. */
export async function subscribeCorpusSyncEvents(
  apiKey: string,
  onStatus: (status: CorpusSyncStatus) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/server-setting/corpus/sync/events`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
  if (!res.body) {
    throw new ApiError("No event stream", res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSseBuffer(buffer, onStatus);
  }
}

export type KnowledgePageListItem = {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  tags: string[];
  sourcePath: string | null;
  contentHash: string;
  updatedAt: string | null;
  parentCount: number;
  childCount: number;
};

export type KnowledgeChildInspect = {
  id: string;
  childIndex: number;
  text: string;
  startOffset: number | null;
  endOffset: number | null;
  embeddingModel: string | null;
  embeddedAt: string | null;
  embedded: boolean;
};

export type KnowledgeParentInspect = {
  id: string;
  parentIndex: number;
  text: string;
  startOffset: number | null;
  endOffset: number | null;
  children: KnowledgeChildInspect[];
};

export type KnowledgePageDetail = {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  tags: string[];
  body: string;
  sourcePath: string | null;
  contentHash: string;
  updatedAt: string | null;
  parents: KnowledgeParentInspect[];
};

function knowledgePageApiPath(id: string): string {
  const encoded = id
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/knowledge/pages/${encoded}`;
}

export async function listKnowledgePages(
  apiKey: string,
): Promise<{ pages: KnowledgePageListItem[] }> {
  return apiFetch<{ pages: KnowledgePageListItem[] }>("/knowledge/pages", {
    apiKey,
  });
}

export async function getKnowledgePage(
  apiKey: string,
  id: string,
): Promise<KnowledgePageDetail> {
  return apiFetch<KnowledgePageDetail>(knowledgePageApiPath(id), { apiKey });
}
