/**
 * OpenAPI tag names — one per module, with finer subgroups for modules
 * that expose several endpoint families (e.g. `knowledge` splits into
 * corpus / retriever, `server-setting` into task-model-map / nuke).
 * Use these constants so every route and the global `tags` list stay in
 * sync.
 */
export const API_TAGS = {
  health: "health",
  users: "users",
  sessions: "sessions",
  query: "query",
  knowledge: "knowledge",
  knowledgeCorpus: "knowledge/corpus",
  knowledgeRetriever: "knowledge/retriever",
  modelProviders: "model-providers",
  log: "log",
  serverSettingTaskModelMap: "server-setting/task-model-map",
  serverSettingNuke: "server-setting/nuke",
};

export type ApiTag = (typeof API_TAGS)[keyof typeof API_TAGS];

/** Top-level `tags` block for the OpenAPI document, ordered by module. */
export const apiTagList: { name: string; description: string }[] = [
  { name: API_TAGS.health, description: "Liveness probes" },
  {
    name: API_TAGS.users,
    description: "User CRUD, personal data, and my-logs",
  },
  { name: API_TAGS.sessions, description: "Chat session lifecycle" },
  { name: API_TAGS.query, description: "Ask-mode synthesis and remember" },
  {
    name: API_TAGS.knowledge,
    description: "Knowledge base inspection (admin)",
  },
  {
    name: API_TAGS.knowledgeCorpus,
    description:
      "Admin corpus sync: remote settings, clone, pull, chunkify, embed, SSE events",
  },
  {
    name: API_TAGS.knowledgeRetriever,
    description: "Admin knowledge-base retrieve settings",
  },
  {
    name: API_TAGS.modelProviders,
    description:
      "Admin model providers: saved connections + catalog + per-model diagnostics",
  },
  {
    name: API_TAGS.log,
    description: "Admin log sink settings and `app_log` purge",
  },
  {
    name: API_TAGS.serverSettingTaskModelMap,
    description:
      "Admin task-model map: which catalog model serves each app task",
  },
  {
    name: API_TAGS.serverSettingNuke,
    description: "Admin danger zone: hard-wipe app tables",
  },
];

/** HTTP Bearer security scheme used by every authenticated route. */
export const bearerSecurityScheme = {
  type: "http" as const,
  scheme: "bearer" as const,
  description: "Authorization: Bearer <api-key>",
};

/** Convenience: the security requirement applied to protected routes. */
export const bearerSecurity = {
  Bearer: [],
};
