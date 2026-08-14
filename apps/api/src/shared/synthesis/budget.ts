import type { ResolvedSynthesisSettings } from "./defaults.ts";

/** Conservative stand-in until a model-specific tokenizer is wired. */
export function estimatePromptTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

export function maxPromptCharacters(
  settings: Pick<
    ResolvedSynthesisSettings,
    "contextWindowTokens" | "maxTokens"
  >,
): number {
  const budget = settings.contextWindowTokens - settings.maxTokens;
  return budget * 4;
}

/**
 * Trim the prompt so estimated tokens + `max_tokens` fit the model window.
 * Keeps the end (current question). Product caps may already be smaller.
 */
export function fitPromptToWindow(
  prompt: string,
  settings: Pick<
    ResolvedSynthesisSettings,
    "contextWindowTokens" | "maxTokens"
  >,
): string {
  const maxChars = maxPromptCharacters(settings);
  if (prompt.length <= maxChars) return prompt;
  const marker = "\n\n[context truncated]";
  const keep = Math.max(0, maxChars - marker.length);
  return `${prompt.slice(prompt.length - keep)}${marker}`;
}
