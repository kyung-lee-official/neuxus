import type { AppMemory, AppMessage } from "../../shared/db.ts";

const MAX_CONTEXT_CHARS = 12_000;

/**
 * Build the synthesis prompt for Bun-side LLM (personal memory + chat history).
 */
export function buildSynthesisPrompt(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[] = [],
): string {
  const history = formatHistory(recentMessages);
  const personal = formatPersonalMemories(personalMemories);
  const parts = [
    "You are answering for a single user.",
    "Use any personal memory block below and the recent conversation.",
    "Personal memory is private to this user; do not invent facts that are not present.",
    "If the available context does not contain the answer, say so clearly.",
    "",
  ];
  if (personal) {
    parts.push("Personal memory (private to this user only):", personal, "");
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

export function slugForMemoryNote(now = new Date()): string {
  return `memory/note-${now.getTime()}`;
}
