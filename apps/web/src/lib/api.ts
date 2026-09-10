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
  ModelConfig: ["server-setting", "model-providers"] as const,
  TaskModelMap: ["server-setting", "task-model-map"] as const,
  CorpusSettings: ["server-setting", "corpus"] as const,
  LogSettings: ["server-setting", "log"] as const,
  RetrieveSettings: ["server-setting", "retrieve"] as const,
  KnowledgePages: ["knowledge", "pages"] as const,
  KnowledgePage: (id: string) => ["knowledge", "pages", id] as const,
  /** Page of the current user's own retrieve/synthesis logs. */
  MyLogs: (cursor: string | null) => ["logs", "mine", cursor] as const,
} as const;

export async function getHealth(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/health");
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
  cursor?: string | null;
  limit?: number;
}): Promise<MyLogsPage> {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const qs = params.toString();
  return apiFetch<MyLogsPage>(`/logs${qs ? `?${qs}` : ""}`, {
    apiKey: input.apiKey,
  });
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

export async function deleteSession(input: {
  apiKey: string;
  sessionId: string;
}): Promise<{ deleted: boolean; id: string }> {
  return apiFetch<{ deleted: boolean; id: string }>(
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

// --- Model providers (catalog + per-provider connections + diagnostics) ---

export type ModelCapability = "embedding" | "text" | "vision";

export type ModelInfo = {
  identifier: string;
  modelId: string;
  displayName: string;
  capabilities: {
    embedding?: true;
    text?: true;
    vision?: true;
  };
  defaults: {
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    embeddingDimensions?: number;
    temperature?: number;
  };
};

export type ProviderInfo = {
  id: string;
  displayName: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  models: ModelInfo[];
};

export type ProvidersResponse = {
  providers: ProviderInfo[];
};

export async function getProviders(apiKey: string): Promise<ProvidersResponse> {
  return apiFetch<ProvidersResponse>(
    "/server-setting/model-providers/providers",
    { apiKey },
  );
}

/** A provider's connection payload is provider-specific. */
export type ProviderConnection = Record<string, unknown>;

export type ProviderConnectionResponse = {
  providerId: string;
  connection: ProviderConnection | null;
};

export async function getProviderConnection(
  apiKey: string,
  providerId: string,
): Promise<ProviderConnectionResponse> {
  return apiFetch<ProviderConnectionResponse>(
    `/server-setting/model-providers/providers/${encodeURIComponent(providerId)}/connection`,
    { apiKey },
  );
}

export async function putProviderConnection(input: {
  apiKey: string;
  providerId: string;
  connection: ProviderConnection;
}): Promise<ProviderConnectionResponse> {
  return apiFetch<ProviderConnectionResponse>(
    `/server-setting/model-providers/providers/${encodeURIComponent(input.providerId)}/connection`,
    {
      method: "PUT",
      apiKey: input.apiKey,
      body: JSON.stringify({ connection: input.connection }),
    },
  );
}

export async function deleteProviderConnection(input: {
  apiKey: string;
  providerId: string;
}): Promise<{ providerId: string; deleted: true }> {
  return apiFetch<{ providerId: string; deleted: true }>(
    `/server-setting/model-providers/providers/${encodeURIComponent(input.providerId)}/connection`,
    { method: "DELETE", apiKey: input.apiKey },
  );
}

/** Fetch each provider's saved connection, keyed by provider id. */
export async function getProviderConnections(
  apiKey: string,
  providerIds: readonly string[],
): Promise<Record<string, ProviderConnection | null>> {
  const entries = await Promise.all(
    providerIds.map(
      async (providerId) =>
        [
          providerId,
          (await getProviderConnection(apiKey, providerId)).connection,
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

export type EmbedTestResult = {
  embedding: number[];
  modelId: string;
  dim: number;
  inputText: string;
};

export async function testEmbed(input: {
  apiKey: string;
  providerId: string;
  modelId: string;
}): Promise<EmbedTestResult> {
  return apiFetch<EmbedTestResult>(
    `/server-setting/model-providers/providers/${encodeURIComponent(input.providerId)}/test/embed`,
    {
      method: "POST",
      apiKey: input.apiKey,
      body: JSON.stringify({ modelId: input.modelId }),
    },
  );
}

export type TextTestResult = {
  modelId: string;
  response: string;
};

export async function testChat(input: {
  apiKey: string;
  providerId: string;
  modelId: string;
  prompt: string;
}): Promise<TextTestResult> {
  return apiFetch<TextTestResult>(
    `/server-setting/model-providers/providers/${encodeURIComponent(input.providerId)}/test/chat`,
    {
      method: "POST",
      apiKey: input.apiKey,
      body: JSON.stringify({ modelId: input.modelId, prompt: input.prompt }),
    },
  );
}

export async function testImage(input: {
  apiKey: string;
  providerId: string;
  modelId: string;
  prompt: string;
  image: File;
}): Promise<TextTestResult> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(input.image);
  });
  const comma = dataUrl.indexOf(",");
  const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return apiFetch<TextTestResult>(
    `/server-setting/model-providers/providers/${encodeURIComponent(input.providerId)}/test/image`,
    {
      method: "POST",
      apiKey: input.apiKey,
      body: JSON.stringify({
        modelId: input.modelId,
        prompt: input.prompt,
        image: { mimeType: input.image.type, data },
      }),
    },
  );
}

// --- Task-model map (which model serves each app task) ---

export type TaskId = "embedding" | "text-synthesis" | "md-image-captioning";

/** Task id -> catalog model identifier (lowercase providerId::modelId), or null. */
export type TaskLinks = Record<TaskId, string | null>;

export type TaskModelMapResponse = {
  tasks: TaskLinks;
};

export async function getTaskModelMap(
  apiKey: string,
): Promise<TaskModelMapResponse> {
  return apiFetch<TaskModelMapResponse>("/server-setting/task-model-map", {
    apiKey,
  });
}

export async function putTaskModelMap(input: {
  apiKey: string;
  tasks: Partial<TaskLinks>;
}): Promise<TaskModelMapResponse> {
  return apiFetch<TaskModelMapResponse>("/server-setting/task-model-map", {
    method: "PUT",
    apiKey: input.apiKey,
    body: JSON.stringify({ tasks: input.tasks }),
  });
}

export type RetrieveSettings = {
  childLimit: number | null;
  maxParents: number | null;
  maxCharacters: number | null;
  defaults: {
    childLimit: number;
    maxParents: number;
    maxCharacters: number;
  };
};

export async function getRetrieveSettings(
  apiKey: string,
): Promise<RetrieveSettings> {
  return apiFetch<RetrieveSettings>("/server-setting/retrieve", { apiKey });
}

export async function putRetrieveSettings(input: {
  apiKey: string;
  settings: {
    childLimit: number | null;
    maxParents: number | null;
    maxCharacters: number | null;
  };
}): Promise<RetrieveSettings> {
  return apiFetch<RetrieveSettings>("/server-setting/retrieve", {
    method: "PUT",
    apiKey: input.apiKey,
    body: JSON.stringify(input.settings),
  });
}

export async function resetRetrieveSettings(
  apiKey: string,
): Promise<RetrieveSettings> {
  return apiFetch<RetrieveSettings>("/server-setting/retrieve/reset", {
    method: "POST",
    apiKey,
  });
}

export type LogSink = "console" | "postgres";

export type LogSettings = {
  sinks: readonly LogSink[];
  queueSize: number | null;
  drainTimeoutMs: number | null;
  pretty: boolean | null;
  defaults: {
    sinks: readonly LogSink[];
    queueSize: number;
    drainTimeoutMs: number;
    pretty: boolean;
  };
  availableSinks: readonly LogSink[];
};

export async function getLogSettings(apiKey: string): Promise<LogSettings> {
  return apiFetch<LogSettings>("/server-setting/log", { apiKey });
}

export async function putLogSettings(input: {
  apiKey: string;
  settings: {
    sinks: readonly LogSink[] | null;
    queueSize: number | null;
    drainTimeoutMs: number | null;
    pretty: boolean | null;
  };
}): Promise<LogSettings> {
  return apiFetch<LogSettings>("/server-setting/log", {
    method: "PUT",
    apiKey: input.apiKey,
    body: JSON.stringify(input.settings),
  });
}

export async function resetLogSettings(apiKey: string): Promise<LogSettings> {
  return apiFetch<LogSettings>("/server-setting/log/reset", {
    method: "POST",
    apiKey,
  });
}

export async function purgeLogSettings(
  apiKey: string,
): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>("/server-setting/log/purge", {
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

export type CorpusOperation = "clone" | "pull" | "chunkify" | "embed" | "sync";

export type CorpusStage =
  | "clone"
  | "fetch"
  | "checkout"
  | "merge"
  | "ingest"
  | "chunkify"
  | "embed";

export type CorpusProgress = {
  phase: "receiving" | "resolving" | "checking-out";
  percent: number;
  processed?: number;
  total?: number;
};

export type CorpusStatus = {
  running: boolean;
  operation: CorpusOperation | null;
  stage: CorpusStage | null;
  progress: CorpusProgress | null;
  lastError: string | null;
};

function parseCorpusStatus(value: unknown): CorpusStatus | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    running?: unknown;
    operation?: unknown;
    stage?: unknown;
    progress?: unknown;
    lastError?: unknown;
  };
  if (typeof row.running !== "boolean") return null;
  const operation =
    row.operation === "clone" ||
    row.operation === "pull" ||
    row.operation === "chunkify" ||
    row.operation === "embed" ||
    row.operation === "sync"
      ? row.operation
      : null;
  const stage =
    row.stage === "clone" ||
    row.stage === "fetch" ||
    row.stage === "checkout" ||
    row.stage === "merge" ||
    row.stage === "ingest" ||
    row.stage === "chunkify" ||
    row.stage === "embed"
      ? row.stage
      : null;
  let progress: CorpusProgress | null = null;
  if (row.progress && typeof row.progress === "object") {
    const p = row.progress as {
      phase?: unknown;
      percent?: unknown;
      processed?: unknown;
      total?: unknown;
    };
    if (
      (p.phase === "receiving" ||
        p.phase === "resolving" ||
        p.phase === "checking-out") &&
      typeof p.percent === "number" &&
      Number.isFinite(p.percent)
    ) {
      progress = {
        phase: p.phase,
        percent: p.percent,
        processed: typeof p.processed === "number" ? p.processed : undefined,
        total: typeof p.total === "number" ? p.total : undefined,
      };
    }
  }
  if (row.lastError !== null && typeof row.lastError !== "string") return null;
  return {
    running: row.running,
    operation,
    stage,
    progress,
    lastError: row.lastError,
  };
}

export async function startChunkify(apiKey: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/server-setting/corpus/chunkify", {
    method: "POST",
    apiKey,
  });
}

export async function startEmbed(apiKey: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/server-setting/corpus/embed", {
    method: "POST",
    apiKey,
  });
}

export async function startCorpusSync(apiKey: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/server-setting/corpus/sync", {
    method: "POST",
    apiKey,
  });
}

function consumeCorpusSseBuffer(
  buffer: string,
  onStatus: (status: CorpusStatus) => void,
): string {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice("data:".length).trim();
      if (raw === "") continue;
      try {
        const parsed = parseCorpusStatus(JSON.parse(raw) as unknown);
        if (parsed) onStatus(parsed);
      } catch {
        /* ignore a truncated JSON frame */
      }
    }
  }
  return rest;
}

/** Stay-open SSE via fetch (Bearer). Resolves when the stream ends. */
export async function subscribeCorpusEvents(
  apiKey: string,
  onStatus: (status: CorpusStatus) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/server-setting/corpus/events`, {
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
    buffer = consumeCorpusSseBuffer(buffer, onStatus);
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
