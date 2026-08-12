import { synthesizeAnswer } from "./chat-client.ts";
import { buildSynthesisPrompt } from "./context.ts";
import type { AppMemory, AppMessage } from "./db.ts";

/** Synthesize an answer from personal memory + recent chat (no external KB). */
export async function answerFromContext(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[],
): Promise<string> {
  const prompt = buildSynthesisPrompt(
    recentMessages,
    userMessage,
    personalMemories,
  );
  return synthesizeAnswer(prompt);
}
