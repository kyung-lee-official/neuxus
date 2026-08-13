import type { ResolvedChunkifyOptions } from "./defaults.ts";
import type { ParentSlice } from "./parents.ts";
import { countTokens } from "./tokenize.ts";
import type { ChunkChild, LexBlock } from "./types.ts";

function spanOf(blocks: LexBlock[]): { start: number; end: number } {
  return {
    start: blocks[0]!.start,
    end: blocks[blocks.length - 1]!.end,
  };
}

function isFenceIntro(
  body: string,
  para: LexBlock,
  fence: LexBlock,
  maxIntroTokens: number,
  encoding: string,
): boolean {
  if (para.kind !== "paragraph" || fence.kind !== "fence") return false;
  // Intro must immediately precede fence in the content block list (caller ensures adjacency)
  const text = body.slice(para.start, para.end);
  return countTokens(text, encoding) <= maxIntroTokens;
}

function takeGlueRun(
  blocks: LexBlock[],
  from: number,
): { group: LexBlock[]; next: number } {
  const first = blocks[from]!;
  const group: LexBlock[] = [first];
  let i = from;
  if (first.glueGroupId != null) {
    while (
      i + 1 < blocks.length &&
      blocks[i + 1]!.glueGroupId === first.glueGroupId
    ) {
      i++;
      group.push(blocks[i]!);
    }
  }
  return { group, next: i + 1 };
}

/** Exclusive ends / next starts: 0, text end, after sentence terminators, after each `\n`. */
export function legalSnapIndices(text: string): number[] {
  const set = new Set<number>([0, text.length]);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "." || ch === "?" || ch === "!") {
      const next = i + 1 < text.length ? text[i + 1]! : "";
      if (next === "" || next === " " || next === "\n") {
        let end = i + 1;
        while (end < text.length && (text[end] === " " || text[end] === "\t")) {
          end++;
        }
        set.add(end);
      }
    }
    if (ch === "\n") {
      set.add(i + 1);
    }
  }
  return [...set].sort((a, b) => a - b);
}

function maxIndexWithTokensAtMost(
  text: string,
  maxTokens: number,
  encoding: string,
): number {
  let lo = 0;
  let hi = text.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (countTokens(text.slice(0, mid), encoding) <= maxTokens) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function pickCutEnd(
  text: string,
  targetTokens: number,
  hardMaxTokens: number,
  encoding: string,
): number {
  if (text.length === 0) return 0;
  const legal = legalSnapIndices(text);
  const T = maxIndexWithTokensAtMost(text, targetTokens, encoding);
  const H = maxIndexWithTokensAtMost(text, hardMaxTokens, encoding);

  let cut = 0;
  for (const idx of legal) {
    if (idx > 0 && idx <= T) cut = idx;
  }
  if (cut > 0) return cut;

  for (const idx of legal) {
    if (idx > T && idx <= H) return idx;
  }

  let whitespace = 0;
  const hi = Math.min(H, text.length);
  for (let i = 1; i <= hi; i++) {
    const c = text[i - 1]!;
    if (c === " " || c === "\t" || c === "\n") whitespace = i;
  }
  if (whitespace > 0) return whitespace;

  return Math.max(1, Math.min(H || text.length, text.length));
}

/** Next-child start into `piece` (exclusive-end `piece.length` is the cut). */
export function pickOverlapStart(
  piece: string,
  overlapTokens: number,
  encoding: string,
): number {
  const cut = piece.length;
  if (cut === 0 || overlapTokens <= 0) return cut;

  let bestS = cut;
  let bestTailTokens = 0;
  for (const S of legalSnapIndices(piece)) {
    if (S <= 0 || S >= cut) continue;
    const tailTokens = countTokens(piece.slice(S), encoding);
    if (tailTokens > overlapTokens) continue;
    if (
      tailTokens > bestTailTokens ||
      (tailTokens === bestTailTokens && S < bestS)
    ) {
      bestTailTokens = tailTokens;
      bestS = S;
    }
  }
  return bestS;
}

function forceSplitParagraph(
  body: string,
  block: LexBlock,
  options: ResolvedChunkifyOptions,
  parentIndex: number,
  childIndexStart: number,
): ChunkChild[] {
  const full = body.slice(block.start, block.end);
  const encoding = options.tokenizerEncoding;
  const target = options.childTargetTokens;
  const hard = options.childHardMaxTokens;
  const overlap = options.childOverlapTokens;

  const children: ChunkChild[] = [];
  let offset = 0;
  let childIndex = childIndexStart;

  while (offset < full.length) {
    const remaining = full.slice(offset);
    if (countTokens(remaining, encoding) <= hard) {
      const start = block.start + offset;
      const end = block.end;
      children.push({
        index: childIndex++,
        parentIndex,
        start,
        end,
        text: body.slice(start, end),
      });
      break;
    }

    const cut = Math.min(
      remaining.length,
      Math.max(1, pickCutEnd(remaining, target, hard, encoding)),
    );
    const piece = remaining.slice(0, cut);
    const start = block.start + offset;
    const end = start + cut;
    children.push({
      index: childIndex++,
      parentIndex,
      start,
      end,
      text: body.slice(start, end),
    });

    const S = pickOverlapStart(piece, overlap, encoding);
    offset += Math.max(S, 1);
  }

  return children;
}

export function packChildren(
  body: string,
  parents: ParentSlice[],
  options: ResolvedChunkifyOptions,
): ChunkChild[] {
  const out: ChunkChild[] = [];

  for (let parentIndex = 0; parentIndex < parents.length; parentIndex++) {
    const parent = parents[parentIndex]!;
    const blocks = parent.blocks;
    if (blocks.length === 0) continue;

    // Expand units: fence-intro glue + glue groups
    type Unit = LexBlock[];
    const units: Unit[] = [];
    let i = 0;
    while (i < blocks.length) {
      const cur = blocks[i]!;
      if (
        cur.kind === "paragraph" &&
        i + 1 < blocks.length &&
        blocks[i + 1]!.kind === "fence" &&
        isFenceIntro(
          body,
          cur,
          blocks[i + 1]!,
          options.fenceIntroGlueMaxTokens,
          options.tokenizerEncoding,
        )
      ) {
        units.push([cur, blocks[i + 1]!]);
        i += 2;
        continue;
      }
      const { group, next } = takeGlueRun(blocks, i);
      units.push(group);
      i = next;
    }

    let current: LexBlock[] = [];
    const flushCurrent = () => {
      if (current.length === 0) return;
      const { start, end } = spanOf(current);
      out.push({
        index: 0, // renumber later per parent
        parentIndex,
        start,
        end,
        text: body.slice(start, end),
      });
      current = [];
    };

    for (const unit of units) {
      const unitTokens = countTokens(
        body.slice(spanOf(unit).start, spanOf(unit).end),
        options.tokenizerEncoding,
      );

      // Single oversized paragraph → force split
      if (
        unit.length === 1 &&
        unit[0]!.kind === "paragraph" &&
        unitTokens > options.childHardMaxTokens
      ) {
        flushCurrent();
        const split = forceSplitParagraph(
          body,
          unit[0]!,
          options,
          parentIndex,
          0,
        );
        out.push(...split);
        continue;
      }

      // Atomic / glue oversized → own child
      const unitAtomic = unit.every(
        (b) => b.atomic || b.glueGroupId != null || b.kind === "fence",
      );
      if (unitTokens > options.childHardMaxTokens && unitAtomic) {
        flushCurrent();
        const { start, end } = spanOf(unit);
        out.push({
          index: 0,
          parentIndex,
          start,
          end,
          text: body.slice(start, end),
        });
        continue;
      }

      if (current.length === 0) {
        current = [...unit];
        continue;
      }

      const trial = [...current, ...unit];
      const trialTokens = countTokens(
        body.slice(spanOf(trial).start, spanOf(trial).end),
        options.tokenizerEncoding,
      );

      if (trialTokens <= options.childTargetTokens) {
        current = trial;
        continue;
      }

      if (trialTokens <= options.childHardMaxTokens) {
        // Prefer staying under hard max; if already past target, flush before adding if current is non-empty and reasonably full
        const currentTokens = countTokens(
          body.slice(spanOf(current).start, spanOf(current).end),
          options.tokenizerEncoding,
        );
        if (currentTokens >= options.childTargetTokens) {
          flushCurrent();
          current = [...unit];
        } else {
          current = trial;
        }
        continue;
      }

      flushCurrent();
      current = [...unit];
    }
    flushCurrent();

    // Crumb merge within this parent's children
    const parentChildren = out.filter((c) => c.parentIndex === parentIndex);
    // Remove and re-merge crumbs
    for (let k = out.length - 1; k >= 0; k--) {
      if (out[k]!.parentIndex === parentIndex) out.splice(k, 1);
    }

    const merged: ChunkChild[] = [];
    for (const child of parentChildren) {
      const tokens = countTokens(child.text, options.tokenizerEncoding);
      if (merged.length > 0 && tokens < options.childCrumbMinTokens) {
        const prev = merged[merged.length - 1]!;
        const combinedText = body.slice(prev.start, child.end);
        const combinedTokens = countTokens(
          combinedText,
          options.tokenizerEncoding,
        );
        const prevWasOversized =
          countTokens(prev.text, options.tokenizerEncoding) >
          options.childHardMaxTokens;
        if (prevWasOversized || combinedTokens <= options.childHardMaxTokens) {
          prev.end = child.end;
          prev.text = combinedText;
          continue;
        }
      }
      merged.push({ ...child });
    }

    for (let idx = 0; idx < merged.length; idx++) {
      merged[idx]!.index = idx;
      out.push(merged[idx]!);
    }
  }

  return out;
}
