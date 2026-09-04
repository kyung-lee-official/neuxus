/**
 * OpenAPI tag names — one per module, with finer subgroups for modules
 * that expose several endpoint families (e.g. `server-setting` splits
 * into model / log / retrieve / corpus / nuke). Use these constants so
 * every route and the global `tags` list stay in sync.
 */
export const API_TAGS = {
  health: "health",
  users: "users",
  sessions: "sessions",
  query: "query",
  knowledge: "knowledge",
  logs: "logs",
  serverSettingModel: "server-setting/model",
  serverSettingLog: "server-setting/log",
  serverSettingRetrieve: "server-setting/retrieve",
  serverSettingCorpus: "server-setting/corpus",
  serverSettingNuke: "server-setting/nuke",
};

export type ApiTag = (typeof API_TAGS)[keyof typeof API_TAGS];

/** Top-level `tags` block for the OpenAPI document, ordered by module. */
export const apiTagList: { name: string; description: string }[] = [
  { name: API_TAGS.health, description: "Liveness probes" },
  { name: API_TAGS.users, description: "User CRUD and personal data" },
  { name: API_TAGS.sessions, description: "Chat session lifecycle" },
  { name: API_TAGS.query, description: "Ask-mode synthesis and remember" },
  {
    name: API_TAGS.knowledge,
    description: "Knowledge base inspection (admin)",
  },
  { name: API_TAGS.logs, description: "Server log retrieval" },
  {
    name: API_TAGS.serverSettingModel,
    description:
      "Admin model registry: providers, catalog models, per-task assignment",
  },
  {
    name: API_TAGS.serverSettingLog,
    description: "Admin log sink settings",
  },
  {
    name: API_TAGS.serverSettingRetrieve,
    description: "Admin knowledge-base retrieve settings",
  },
  {
    name: API_TAGS.serverSettingCorpus,
    description: "Admin corpus sync: clone, pull, chunkify, embed, SSE events",
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
