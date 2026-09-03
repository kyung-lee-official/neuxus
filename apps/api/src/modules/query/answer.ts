import type { AppMemory, AppMessage } from "../../shared/db.ts";
import type { RetrievedParent } from "../../shared/retrieve/index.ts";
import {
  createSynthesizer,
  fitPromptToWindow,
  loadSynthesisSettings,
  type Synthesizer,
} from "../../shared/synthesis/index.ts";
import { buildSynthesisPrompt, stripMarkdownImageLines } from "./context.ts";

export type AnswerFromContextOptions = {
  synthesizer?: Synthesizer;
  /**
   * Forwarded to `createSynthesizer` when no pre-built synthesizer is
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
  const settings = await loadSynthesisSettings();
  const synthesizer =
    options?.synthesizer ??
    createSynthesizer(settings, { userId: options?.userId });
  const prompt = fitPromptToWindow(
    buildSynthesisPrompt(
      recentMessages,
      userMessage,
      personalMemories,
      parents,
    ),
    settings,
  );
  // Strip markdown image references before sending to the LLM. The image
  // bytes stay on disk; the description lives in the corresponding
  // `<!-- image_desc ... -->` comment which we keep.
  const promptWithoutImages = stripMarkdownImageLines(prompt);
  return synthesizer.synthesize(promptWithoutImages);
}
