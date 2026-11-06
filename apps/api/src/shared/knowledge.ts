/** Warnings for a multi-KB retrieval that returned partial results. */

export type KnowledgeWarningCode =
  | "knowledge_base_not_found"
  | "retrieval_failed";

export type KnowledgeWarning = {
  code: KnowledgeWarningCode;
  knowledgeBaseId: string;
  message: string;
};
