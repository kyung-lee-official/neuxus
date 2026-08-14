import { normalizeBody } from "../ingest/normalize.ts";
import { packChildren } from "./children.ts";
import { type ChunkifyOptions, resolveChunkifyOptions } from "./defaults.ts";
import { lexBlocks } from "./lex.ts";
import { buildParents } from "./parents.ts";
import type { ChunkifyResult } from "./types.ts";

export { CHUNKIFY_DEFAULTS, resolveChunkifyOptions } from "./defaults.ts";
export type { ChunkifyOptions, ChunkifyResult };

/**
 * Pure parent–child chunkifier for GFM markdown `body`.
 * @see docs/modern-knowledge-base-design/03-chunkify.md
 */
export function chunkify(
  body: string,
  options?: ChunkifyOptions,
): ChunkifyResult {
  const resolved = resolveChunkifyOptions(options);
  const normalized = normalizeBody(body);

  if (normalized.trim() === "") {
    return { parents: [], children: [] };
  }

  const blocks = lexBlocks(normalized);
  const parentSlices = buildParents(normalized, blocks, resolved);
  const children = packChildren(normalized, parentSlices, resolved);

  const parents = parentSlices.map((p, index) => ({
    index,
    start: p.start,
    end: p.end,
    text: normalized.slice(p.start, p.end),
  }));

  return { parents, children };
}
