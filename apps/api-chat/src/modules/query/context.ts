/**
 * Chat-side context assembly: the client owns history and personal memory.
 * Knowledge-base evidence is added by neuxus to the current human turn only.
 */

import type { AppMessage } from "../personal-data/chat-messages/service.ts";
import type { AppMemory } from "../personal-data/personal-memory/service.ts";

export type ChatMessageInput = {
  role: "user" | "assistant";
  content: string;
};

export function chatSystem(memories: AppMemory[]): string {
  const parts = [
    "You are answering for a single user.",
    "Use the knowledge-base excerpts supplied with the current question when they are relevant.",
    "Personal memory is private to this user; do not invent facts that are not present.",
    "If the available context does not contain the answer, say so clearly.",
  ];
  if (memories.length > 0) {
    parts.push(
      "",
      "Personal memory (private to this user only):",
      ...memories.map(
        (memory) => `- [${memory.slug}] ${memory.content.trim()}`,
      ),
    );
  }
  return parts.join("\n");
}

/** Recent history followed by the current question. */
export function chatMessages(
  recent: AppMessage[],
  current: string,
): ChatMessageInput[] {
  return [
    ...recent.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user" as const, content: current },
  ];
}
