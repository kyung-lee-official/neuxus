import type { Model } from "../../modules/server-setting/model-providers/core/types.ts";
import {
  resolveTaskModelLink,
  TASK_TEXT_SYNTHESIS,
} from "../../modules/server-setting/task-model-map/service.ts";
import type { AppMemory, AppMessage } from "../../shared/db.ts";
import { childLogger } from "../../shared/log/index.ts";
import type { RetrievedParent } from "../../shared/retrieve/index.ts";
import { buildSynthesisPrompt, stripMarkdownImageLines } from "./context.ts";

const synthesisLog = childLogger({ module: "synthesis" }, "synthesis");

export type AnswerFromContextOptions = {
  /** Stamps the `app_log` synthesis rows with this user. */
  userId?: string;
};

/**
 * Trim the prompt so estimated tokens + `maxTokens` fit the model window.
 * Keeps the end (current question).
 */
function fitPromptToWindow(
  prompt: string,
  model: Pick<Model, "defaults">,
  maxTokens: number,
): string {
  const window = model.defaults.contextWindowTokens;
  if (!window || window < 1 || maxTokens < 1) return prompt;
  if (maxTokens >= window) return prompt;
  const maxChars = (window - maxTokens) * 4;
  if (prompt.length <= maxChars) return prompt;
  const marker = "\n\n[context truncated]";
  const keep = Math.max(0, maxChars - marker.length);
  return `${prompt.slice(prompt.length - keep)}${marker}`;
}

/** Build a prompt from memory, chat, and KB parents, then synthesize. */
export async function answerFromContext(
  recentMessages: AppMessage[],
  userMessage: string,
  personalMemories: AppMemory[],
  parents: RetrievedParent[] = [],
  options?: AnswerFromContextOptions,
): Promise<string> {
  const link = await resolveTaskModelLink(TASK_TEXT_SYNTHESIS);
  if (!link) {
    throw new Error("No model is linked to the text-synthesis task");
  }
  const { provider, model } = link;
  const userId = options?.userId;
  const maxTokens = model.defaults.maxOutputTokens ?? 4096;

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

  const start = performance.now();
  try {
    const response = await provider.textChat(
      model.modelId,
      promptWithoutImages,
    );
    synthesisLog.info("synthesis ok", {
      userId: userId ?? null,
      providerId: provider.id,
      modelId: model.modelId,
      maxTokens,
      promptChars: promptWithoutImages.length,
      response,
      latencyMs: Math.round(performance.now() - start),
      status: "ok",
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    synthesisLog.error("synthesis error", {
      userId: userId ?? null,
      providerId: provider.id,
      modelId: model.modelId,
      promptChars: promptWithoutImages.length,
      error: message,
      latencyMs: Math.round(performance.now() - start),
      status: "error",
    });
    throw err;
  }
}
