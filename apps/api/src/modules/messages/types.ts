/**
 * Anthropic Messages protocol types used at the neuxus boundary. The request is
 * passed through; neuxus replaces `model` and rewrites `messages`.
 *
 * @see docs/modern-knowledge-base-design/appendix-b-protocol.md
 */

import type { KnowledgeWarning } from "../../shared/knowledge.ts";

export type JsonObject = Record<string, unknown>;

export type AnthropicMessage = JsonObject & {
  role: string;
  content: string | unknown[];
};

export type MessagesRequestBody = JsonObject & {
  knowledgeBaseIds: string[];
  max_tokens: number;
  messages: AnthropicMessage[];
  stream?: boolean;
  metadata?: JsonObject & { user_id?: string };
};

export type NeuxusSource = {
  knowledgeBaseId: string;
  parentId: string;
  pageId: string;
  title: string;
  quote: string;
  score: number;
};

export type NeuxusSignals = {
  hits: number;
  usedParents: number;
  topScore: number | null;
  margin: number | null;
};

export type NeuxusEnrichmentReason = "no_human_turn" | "no_hits";

export type NeuxusExtension = {
  protocolVersion: "1";
  requestId: string;
  knowledgeBaseIds: string[];
  searchedKnowledgeBaseIds: string[];
  warnings?: KnowledgeWarning[];
  enriched: boolean;
  enrichment: {
    turnIndex: number | null;
    injectedChars: number;
    reason?: NeuxusEnrichmentReason;
    truncated: boolean;
  };
  upstream: { provider: string; model: string };
  sources: NeuxusSource[];
  signals: NeuxusSignals;
};

export type MessageResponse = JsonObject & { neuxus?: NeuxusExtension };

export type MessagesHeaders = {
  extensions: "sources" | "none";
  anthropicVersion: string;
  anthropicBeta: string;
};
