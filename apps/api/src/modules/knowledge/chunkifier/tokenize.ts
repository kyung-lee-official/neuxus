import { Tokenizer } from "ai-tokenizer";
import * as cl100k_base from "ai-tokenizer/encoding/cl100k_base";
import * as o200k_base from "ai-tokenizer/encoding/o200k_base";
import * as p50k_base from "ai-tokenizer/encoding/p50k_base";

// Encoding modules are opaque to TypeScript; Tokenizer accepts them at runtime.
const encodings: Record<string, object> = {
  o200k_base,
  cl100k_base,
  p50k_base,
};

const tokenizerByEncoding = new Map<string, Tokenizer>();

export function countTokens(text: string, encodingId: string): number {
  let tokenizer = tokenizerByEncoding.get(encodingId);
  if (!tokenizer) {
    const encoding = encodings[encodingId] ?? o200k_base;
    tokenizer = new Tokenizer(encoding as never);
    tokenizerByEncoding.set(encodingId, tokenizer);
  }
  return tokenizer.count(text);
}
