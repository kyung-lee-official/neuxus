import type { ResolvedChunkifyOptions } from "./defaults.ts";
import { contentBlocks } from "./lex.ts";
import { countTokens } from "./tokenize.ts";
import type { LexBlock } from "./types.ts";

export type ParentSlice = {
  blocks: LexBlock[];
  start: number;
  end: number;
};

function spanOf(blocks: LexBlock[]): { start: number; end: number } {
  const first = blocks[0]!;
  const last = blocks[blocks.length - 1]!;
  return { start: first.start, end: last.end };
}

function tokensFor(
  body: string,
  blocks: LexBlock[],
  encoding: string,
): number {
  const { start, end } = spanOf(blocks);
  return countTokens(body.slice(start, end), encoding);
}

function splitByHeadingLevel(
  blocks: LexBlock[],
  level: number,
): LexBlock[][] {
  const groups: LexBlock[][] = [];
  let current: LexBlock[] = [];
  for (const b of blocks) {
    if (
      b.kind === "heading" &&
      b.level === level &&
      current.length > 0
    ) {
      groups.push(current);
      current = [b];
    } else {
      current.push(b);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Never split a glue group across parents. */
function packBySize(
  body: string,
  blocks: LexBlock[],
  maxTokens: number,
  encoding: string,
): LexBlock[][] {
  if (blocks.length === 0) return [];
  if (tokensFor(body, blocks, encoding) <= maxTokens) return [blocks];

  const packs: LexBlock[][] = [];
  let current: LexBlock[] = [];

  const flush = () => {
    if (current.length > 0) {
      packs.push(current);
      current = [];
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    // Pull entire glue group together
    const group: LexBlock[] = [b];
    if (b.glueGroupId != null) {
      while (
        i + 1 < blocks.length &&
        blocks[i + 1]!.glueGroupId === b.glueGroupId
      ) {
        i++;
        group.push(blocks[i]!);
      }
      // Also skip blanks between glued members — they're not in contentBlocks
    }

    if (current.length === 0) {
      current = group;
      continue;
    }

    const trial = [...current, ...group];
    if (tokensFor(body, trial, encoding) <= maxTokens) {
      current = trial;
    } else {
      flush();
      current = group;
    }
  }
  flush();
  return packs;
}

/**
 * Structure-first parents: ## sections, then ###, then size packs.
 */
export function buildParents(
  body: string,
  allBlocks: LexBlock[],
  options: ResolvedChunkifyOptions,
): ParentSlice[] {
  const blocks = contentBlocks(allBlocks);
  if (blocks.length === 0) return [];

  const hasH2 = blocks.some((b) => b.kind === "heading" && b.level === 2);

  let sections: LexBlock[][];
  if (hasH2) {
    sections = splitByHeadingLevel(blocks, 2);
  } else {
    sections = [blocks];
  }

  const parents: ParentSlice[] = [];

  for (const section of sections) {
    if (tokensFor(body, section, options.tokenizerEncoding) <= options.parentMaxTokens) {
      const { start, end } = spanOf(section);
      parents.push({ blocks: section, start, end });
      continue;
    }

    const hasH3 = section.some((b) => b.kind === "heading" && b.level === 3);
    const subSections = hasH3
      ? splitByHeadingLevel(section, 3)
      : [section];

    for (const sub of subSections) {
      if (
        tokensFor(body, sub, options.tokenizerEncoding) <= options.parentMaxTokens
      ) {
        const { start, end } = spanOf(sub);
        parents.push({ blocks: sub, start, end });
        continue;
      }

      for (const pack of packBySize(
        body,
        sub,
        options.parentMaxTokens,
        options.tokenizerEncoding,
      )) {
        const { start, end } = spanOf(pack);
        parents.push({ blocks: pack, start, end });
      }
    }
  }

  coverBodyGaps(body, parents);
  return parents;
}

/** Trailing blanks attach to the previous parent; first parent starts at 0. */
function coverBodyGaps(body: string, parents: ParentSlice[]): void {
  if (parents.length === 0) return;
  parents[0]!.start = 0;
  for (let i = 0; i < parents.length - 1; i++) {
    parents[i]!.end = parents[i + 1]!.start;
  }
  parents[parents.length - 1]!.end = body.length;
}
