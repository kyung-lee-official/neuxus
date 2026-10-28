/**
 * OpenAPI tag names for the chat app. Keep constants here so every route and
 * the global `tags` list stay in sync.
 */
export const API_TAGS = {
  health: "health",
} as const;

export type ApiTag = (typeof API_TAGS)[keyof typeof API_TAGS];

/** Top-level `tags` block for the OpenAPI document. */
export const apiTagList: { name: string; description: string }[] = [
  { name: API_TAGS.health, description: "Liveness probes" },
];

/** HTTP Bearer security scheme used by authenticated routes. */
export const bearerSecurityScheme = {
  type: "http" as const,
  scheme: "bearer" as const,
  description: "Authorization: Bearer <api-key>",
};

/** Convenience: the security requirement applied to protected routes. */
export const bearerSecurity = {
  Bearer: [],
};
