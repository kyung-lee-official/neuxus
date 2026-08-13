import type { LexBlock } from "./types.ts";


type Line = {
  /** Inclusive start offset in body */
  start: number;
  /** Exclusive end offset (points past trailing `\n` if present) */
  end: number;
  /** Line text without trailing `\n` */
  text: string;
};

function linesOf(body: string): Line[] {
  const lines: Line[] = [];
  let i = 0;
  while (i <= body.length) {
    if (i === body.length) {
      if (body.length === 0 || body.endsWith("\n")) break;
      break;
    }
    const nl = body.indexOf("\n", i);
    if (nl === -1) {
      lines.push({ start: i, end: body.length, text: body.slice(i) });
      break;
    }
    lines.push({ start: i, end: nl + 1, text: body.slice(i, nl) });
    i = nl + 1;
  }
  return lines;
}

const ATX_HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#*)?[ \t]*$/;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HR = /^( {0,3})([-*_])(?:[ \t]*\2){2,}[ \t]*$/;
const LIST_ITEM = /^( {0,3})([-*+]|\d+[.)])([ \t]+|$)/;
const BLOCKQUOTE = /^( {0,3})>/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const IMAGE_MD = /^![ \t]*\[.*?\]\(.*\)\s*$/;
const IMAGE_HTML = /^<img\b[^>]*>\s*$/i;
const IMAGE_DESC_OPEN_LINE = "<!-- image-desc -->";
const IMAGE_DESC_CLOSE_LINE = "<!-- /image-desc -->";

function isImageDescOpen(lineText: string): boolean {
  return lineText.trim() === IMAGE_DESC_OPEN_LINE;
}

function isImageDescClose(lineText: string): boolean {
  return lineText.trim() === IMAGE_DESC_CLOSE_LINE;
}

function isBlankLine(text: string): boolean {
  return text.trim() === "";
}

function isIndentedCodeLine(text: string): boolean {
  return /^ {4}|\t/.test(text) && text.trim() !== "";
}

/**
 * GFM-oriented source lexer with exact offsets.
 * Bun.markdown does not expose source positions (open issue); v1 scans the body directly.
 */
export function lexBlocks(body: string): LexBlock[] {
  const lines = linesOf(body);
  const blocks: LexBlock[] = [];
  let i = 0;
  let glueId = 0;

  const push = (block: LexBlock) => {
    blocks.push(block);
  };

  while (i < lines.length) {
    const line = lines[i]!;

    if (isBlankLine(line.text)) {
      const start = line.start;
      let end = line.end;
      i++;
      while (i < lines.length && isBlankLine(lines[i]!.text)) {
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "blank", start, end, atomic: false });
      continue;
    }

    const fence = line.text.match(FENCE_OPEN);
    if (fence) {
      const marker = fence[2]!;
      const ch = marker[0]!;
      const minLen = marker.length;
      const start = line.start;
      let end = line.end;
      i++;
      while (i < lines.length) {
        const t = lines[i]!.text;
        const close = t.match(/^( {0,3})(`{3,}|~{3,})[ \t]*$/);
        if (
          close &&
          close[2]![0] === ch &&
          close[2]!.length >= minLen
        ) {
          end = lines[i]!.end;
          i++;
          break;
        }
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "fence", start, end, atomic: true });
      continue;
    }

    const heading = line.text.match(ATX_HEADING);
    if (heading) {
      push({
        kind: "heading",
        start: line.start,
        end: line.end,
        level: heading[1]!.length,
        atomic: true,
      });
      i++;
      continue;
    }

    if (HR.test(line.text) && !TABLE_DELIM.test(line.text)) {
      push({ kind: "hr", start: line.start, end: line.end, atomic: true });
      i++;
      continue;
    }

    if (isImageDescOpen(line.text)) {
      const start = line.start;
      let end = line.end;
      i++;
      while (i < lines.length && !isImageDescClose(lines[i]!.text)) {
        // Stop at next structural boundary if closer missing
        const t = lines[i]!.text;
        if (
          ATX_HEADING.test(t) ||
          FENCE_OPEN.test(t) ||
          isImageDescOpen(t)
        ) {
          break;
        }
        end = lines[i]!.end;
        i++;
      }
      if (i < lines.length && isImageDescClose(lines[i]!.text)) {
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "image_desc", start, end, atomic: true });
      continue;
    }

    if (
      i + 1 < lines.length &&
      (TABLE_ROW.test(line.text) || /^\s*[^|]+\|.+/.test(line.text)) &&
      TABLE_DELIM.test(lines[i + 1]!.text)
    ) {
      const start = line.start;
      let end = lines[i + 1]!.end;
      i += 2;
      while (i < lines.length && !isBlankLine(lines[i]!.text)) {
        const t = lines[i]!.text;
        if (
          ATX_HEADING.test(t) ||
          FENCE_OPEN.test(t) ||
          HR.test(t) ||
          BLOCKQUOTE.test(t)
        ) {
          break;
        }
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "table", start, end, atomic: true });
      continue;
    }

    if (LIST_ITEM.test(line.text)) {
      const start = line.start;
      let end = line.end;
      i++;
      while (i < lines.length) {
        const t = lines[i]!.text;
        if (isBlankLine(t)) {
          // Peek: blank then list continuation or indented content keeps list
          if (
            i + 1 < lines.length &&
            (LIST_ITEM.test(lines[i + 1]!.text) ||
              isIndentedCodeLine(lines[i + 1]!.text) ||
              /^ {1,}/.test(lines[i + 1]!.text))
          ) {
            end = lines[i]!.end;
            i++;
            continue;
          }
          break;
        }
        if (
          ATX_HEADING.test(t) ||
          FENCE_OPEN.test(t) ||
          HR.test(t) ||
          isImageDescOpen(t)
        ) {
          break;
        }
        // New top-level paragraph that isn't a list item ends the list
        if (
          !LIST_ITEM.test(t) &&
          !/^[ \t]/.test(t) &&
          !BLOCKQUOTE.test(t)
        ) {
          // Could be tight continuation — CommonMark: non-indented non-list ends list after blank only
          break;
        }
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "list", start, end, atomic: true });
      continue;
    }

    if (BLOCKQUOTE.test(line.text)) {
      const start = line.start;
      let end = line.end;
      i++;
      while (i < lines.length) {
        const t = lines[i]!.text;
        if (isBlankLine(t)) break;
        if (!BLOCKQUOTE.test(t) && !/^[ \t]/.test(t)) break;
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "blockquote", start, end, atomic: true });
      continue;
    }

    if (isIndentedCodeLine(line.text)) {
      const start = line.start;
      let end = line.end;
      i++;
      while (i < lines.length && (isIndentedCodeLine(lines[i]!.text) || isBlankLine(lines[i]!.text))) {
        // Trailing blank after indented code: include only blanks that are followed by more indented code
        if (isBlankLine(lines[i]!.text)) {
          let j = i + 1;
          while (j < lines.length && isBlankLine(lines[j]!.text)) j++;
          if (j >= lines.length || !isIndentedCodeLine(lines[j]!.text)) break;
        }
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "indented_code", start, end, atomic: true });
      continue;
    }

    if (/^ {0,3}</.test(line.text) && !IMAGE_HTML.test(line.text)) {
      const start = line.start;
      let end = line.end;
      i++;
      // Simple HTML block: until blank line (v1)
      while (i < lines.length && !isBlankLine(lines[i]!.text)) {
        end = lines[i]!.end;
        i++;
      }
      push({ kind: "html", start, end, atomic: true });
      continue;
    }

    const start = line.start;
    let end = line.end;
    i++;
    while (i < lines.length) {
      const t = lines[i]!.text;
      if (isBlankLine(t)) break;
      if (
        ATX_HEADING.test(t) ||
        FENCE_OPEN.test(t) ||
        HR.test(t) ||
        LIST_ITEM.test(t) ||
        BLOCKQUOTE.test(t) ||
        isImageDescOpen(t) ||
        (TABLE_ROW.test(t) &&
          i + 1 < lines.length &&
          TABLE_DELIM.test(lines[i + 1]!.text))
      ) {
        break;
      }
      end = lines[i]!.end;
      i++;
    }

    const trimmedLines = body
      .slice(start, end)
      .replace(/\n$/, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const isImage =
      trimmedLines.length === 1 &&
      (IMAGE_MD.test(trimmedLines[0]!) || IMAGE_HTML.test(trimmedLines[0]!));

    push({
      kind: isImage ? "image" : "paragraph",
      start,
      end,
      atomic: isImage,
    });
  }

  // Glue image + following image_desc (blank between allowed)
  for (let b = 0; b < blocks.length; b++) {
    const cur = blocks[b]!;
    if (cur.kind !== "image") continue;
    let j = b + 1;
    while (j < blocks.length && blocks[j]!.kind === "blank") j++;
    if (j < blocks.length && blocks[j]!.kind === "image_desc") {
      const id = ++glueId;
      cur.glueGroupId = id;
      blocks[j]!.glueGroupId = id;
    }
  }

  for (const block of blocks) {
    if (block.kind === "image_desc" && block.glueGroupId == null) {
      block.kind = "html";
    }
  }

  return blocks;
}

export function contentBlocks(blocks: LexBlock[]): LexBlock[] {
  return blocks.filter((b) => b.kind !== "blank");
}
