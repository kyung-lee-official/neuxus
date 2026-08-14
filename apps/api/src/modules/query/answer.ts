import type { AppMemory, AppMessage } from "../../shared/db.ts";
import type { RetrievedParent } from "../../shared/retrieve/index.ts";
import {
  createSynthesizer,
  fitPromptToWindow,
  loadSynthesisSettings,
  type Synthesizer,
} from "../../shared/synthesis/index.ts";
import { buildSynthesisPrompt } from "./context.ts";

export type AnswerFromContextOptions = {
  synthesizer?: Synthesizer;
};

/** Build a prompt from memory, chat, and KB parents, then synthesize. */
export async function answerFromContext(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[],
  parents: RetrievedParent[] = [],
  options?: AnswerFromContextOptions,
): Promise<string> {
  const settings = await loadSynthesisSettings();
  const synthesizer = options?.synthesizer ?? createSynthesizer(settings);
  const prompt = fitPromptToWindow(
    buildSynthesisPrompt(
      recentMessages,
      userMessage,
      personalMemories,
      parents,
    ),
    settings,
  );
  return synthesizer.synthesize(prompt);
}
