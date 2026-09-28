import type {
  RetrievedImage,
  RetrievedParent,
} from "../knowledge/retriever/index.ts";
import type { AppMessage } from "../personal-data/chat-messages/service.ts";
import type { AppMemory } from "../personal-data/personal-memory/service.ts";
import { formatKnowledgeContext } from "./images.ts";

const MAX_CONTEXT_CHARS = 12_000;

/**
 * Build the synthesis prompt (personal memory, KB parents + image hits, chat).
 */
export function buildSynthesisPrompt(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[] = [],
  parents: RetrievedParent[] = [],
  images: RetrievedImage[] = [],
): string {
  const history = formatHistory(recentMessages);
  const personal = formatPersonalMemories(personalMemories);
  const knowledge = formatKnowledgeContext(parents, images);
  const parts = [
    "You are answering for a single user.",
    "Use the knowledge-base context, personal memory, and recent conversation below.",
    "Personal memory is private to this user; do not invent facts that are not present.",
    "If the available context does not contain the answer, say so clearly.",
    "",
  ];
  if (personal) {
    parts.push("Personal memory (private to this user only):", personal, "");
  }
  if (knowledge) {
    parts.push("Knowledge base:", knowledge, "");
  }
  if (history) {
    parts.push("Recent conversation (for context only):", history, "");
  }
  parts.push("Current question:", userMessage.trim());
  return trimToMax(parts.join("\n"), MAX_CONTEXT_CHARS);
}

function formatHistory(messages: AppMessage[]): string {
  if (messages.length === 0) return "";
  return messages
    .map(
      (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`,
    )
    .join("\n");
}

function formatPersonalMemories(memories: AppMemory[]): string {
  if (memories.length === 0) return "";
  return memories.map((m) => `- [${m.slug}] ${m.content.trim()}`).join("\n");
}

function trimToMax(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[context truncated]`;
}
