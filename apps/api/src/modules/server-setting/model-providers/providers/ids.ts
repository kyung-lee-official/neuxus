/** Canonical provider ids — single source; import these, don't use literals. */
export const PROVIDER_MINIMAX_DEFAULT = "minimax-default";
export const PROVIDER_MINIMAX_TOKEN_PLAN = "minimax-token-plan";
export const PROVIDER_DEEPSEEK = "deepseek";
export const PROVIDER_OLLAMA = "ollama";

export type ProviderId =
  | typeof PROVIDER_MINIMAX_DEFAULT
  | typeof PROVIDER_MINIMAX_TOKEN_PLAN
  | typeof PROVIDER_DEEPSEEK
  | typeof PROVIDER_OLLAMA;
