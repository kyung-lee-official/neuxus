import type { AppMemory, AppMessage } from "../../shared/db.ts";
import { fitPromptToWindow } from "../../shared/models/clients/chat.ts";
import {
  getSynthesizer,
  loadModelConfig,
  resolveModel,
} from "../../shared/models/index.ts";
import type { Synthesizer } from "../../shared/models/types.ts";
import type { RetrievedParent } from "../../shared/retrieve/index.ts";
import { buildSynthesisPrompt, stripMarkdownImageLines } from "./context.ts";

export type AnswerFromContextOptions = {
  synthesizer?: Synthesizer;
  /**
   * Forwarded to `getSynthesizer` when no pre-built synthesizer is
   * supplied. Stamps the resulting synthesis log rows with this user.
   */
  userId?: string;
};

/** Build a prompt from memory, chat, and KB parents, then synthesize. */
export async function answerFromContext(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[],
  parents: RetrievedParent[] = [],
  options?: AnswerFromContextOptions,
): Promise<string> {
  const config = await loadModelConfig();
  const { model } = resolveModel("llm", config);
  const maxTokens = model.defaults.maxOutputTokens ?? 4096;
  const synthesizer =
    options?.synthesizer ?? (await getSynthesizer({ userId: options?.userId }));
  const prompt = fitPromptToWindow(
    buildSynthesisPrompt(
      recentMessages,
      userMessage,
      personalMemories,
      parents,
    ),
    model,
    maxTokens,
  );
  // Strip markdown image references before sending to the LLM. The image
  // bytes stay on disk; the description lives in the corresponding
  // `<!-- image_desc ... -->` comment which we keep.
  const promptWithoutImages = stripMarkdownImageLines(prompt);
  return synthesizer.synthesize(promptWithoutImages);
}
