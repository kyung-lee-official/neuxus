/** OpenAPI tag names — one per module. Use these constants so every route
 *  and the global `tags` list stay in sync. */
export const API_TAGS = {
  health: "health",
  users: "users",
  sessions: "sessions",
  query: "query",
  knowledge: "knowledge",
  logs: "logs",
  serverSetting: "server-setting",
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
    name: API_TAGS.serverSetting,
    description:
      "Admin server settings (model registry, retrieve, log, corpus, nuke)",
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
