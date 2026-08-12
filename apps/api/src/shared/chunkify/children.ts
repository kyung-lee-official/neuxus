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

  // Work on content without forcing inclusion issues — offsets must map to body
  const children: ChunkChild[] = [];
  let offset = 0; // into `full`
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

    // Prefer sentence boundary near target
    let cut = pickCutIndex(remaining, target, hard, encoding);
    if (cut <= 0)
      cut = Math.min(
        remaining.length,
        Math.max(1, Math.floor(remaining.length / 2)),
      );

    const piece = remaining.slice(0, cut);
    // Grow with overlap into next iteration via absolute offsets
    const start = block.start + offset;
    const end = start + cut;
    // Trim cut to not split mid-line awkwardly — already on char index

    children.push({
      index: childIndex++,
      parentIndex,
      start,
      end,
      text: body.slice(start, end),
    });

    // Next offset retreats by overlap tokens
    const overlapChars = charsForOverlap(piece, overlap, encoding);
    offset = Math.max(offset + cut - overlapChars, offset + 1);
  }

  return children;
}

function pickCutIndex(
  text: string,
  target: number,
  hard: number,
  encoding: string,
): number {
  // Binary search character end so tokens ~= target, then snap to sentence
  let lo = 1;
  let hi = text.length;
  let best = Math.min(text.length, 1);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const n = countTokens(text.slice(0, mid), encoding);
    if (n < target) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Snap forward/back to sentence end within hard max
  const window = text.slice(0, Math.min(text.length, Math.max(best, 1)));
  const sentenceEnds: number[] = [];
  for (const re of [/\. /g, /\? /g, /! /g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(window)) !== null) {
      sentenceEnds.push(m.index + m[0].length);
    }
  }
  sentenceEnds.sort((a, b) => a - b);
  let snapped = best;
  for (const end of sentenceEnds) {
    if (countTokens(text.slice(0, end), encoding) <= hard) {
      snapped = end;
    }
    if (countTokens(text.slice(0, end), encoding) >= target) break;
  }
  if (countTokens(text.slice(0, snapped), encoding) > hard) {
    // Whitespace fallback
    let w = snapped;
    while (w > 0 && countTokens(text.slice(0, w), encoding) > hard) {
      const prev = text.lastIndexOf(" ", w - 1);
      if (prev <= 0) {
        w = Math.max(1, Math.floor(w / 2));
        break;
      }
      w = prev;
    }
    return Math.max(1, w);
  }
  return Math.max(1, snapped);
}

function charsForOverlap(
  piece: string,
  overlapTokens: number,
  encoding: string,
): number {
  if (overlapTokens <= 0 || piece.length === 0) return 0;
  let lo = 0;
  let hi = piece.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = piece.slice(piece.length - mid);
    const n = countTokens(slice, encoding);
    if (n <= overlapTokens) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
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
