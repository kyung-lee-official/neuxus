import type { KnowledgeWarning } from "../../../shared/knowledge.ts";
import { Logger } from "../../log/index.ts";

const retrieveLog = Logger.child({ module: "retrieve" }, "retrieve");

/** Persist one aggregate warning when retrieval returns partial results. */
export function logRetrievalWarnings(input: {
  userId?: string;
  requestedKnowledgeBaseIds: string[];
  warnings: KnowledgeWarning[];
  embeddingModel: string;
  hits: number;
  latencyMs: number;
}): void {
  if (input.warnings.length === 0) return;
  retrieveLog.warn("retrieve partial", {
    userId: input.userId,
    status: "partial",
    requestedKnowledgeBaseIds: input.requestedKnowledgeBaseIds,
    failedKnowledgeBases: input.warnings,
    embeddingModel: input.embeddingModel,
    hits: input.hits,
    latencyMs: input.latencyMs,
  });
}
