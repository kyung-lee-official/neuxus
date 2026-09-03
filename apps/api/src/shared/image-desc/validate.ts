/**
 * Find orphan image_desc openers in a markdown body.
 *
 * An image_desc block is the pair
 *   `<!-- image_desc -->`  (opener)
 *   ...
 *   `<!-- /image_desc -->`  (closer)
 * Matched in source order. Each opener must have a closer
 * strictly after it on a later line. Otherwise the opener is an
 * orphan — this function returns the line numbers and texts of all
 * orphan openers, with the source path attached for log correlation.
 */

const OPENER_RE = /^\s*<!--\s*image_desc\s*-->\s*$/;
const CLOSER_RE = /^\s*<!--\s*\/image_desc\s*-->\s*$/;

export type OrphanImageDesc = {
  /** 1-based line number. */
  line: number;
  /** The literal opener text from the file. */
  text: string;
};

export function findOrphanImageDescOpeners(body: string): OrphanImageDesc[] {
  const lines = body.split("\n");
  const openers: { line: number; text: string }[] = [];
  const closerLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!;
    if (OPENER_RE.test(t)) {
      openers.push({ line: i + 1, text: t });
    } else if (CLOSER_RE.test(t)) {
      closerLines.push(i + 1);
    }
  }
  // Each opener consumes the next closer line that is strictly after it.
  const consumed = new Set<number>();
  for (const op of openers) {
    const match = closerLines.find((c) => c > op.line && !consumed.has(c));
    if (match !== undefined) consumed.add(match);
  }
  return openers
    .filter((op) => !closerLines.some((c) => c > op.line && consumed.has(c)))
    .map((op) => ({ line: op.line, text: op.text }));
}

/**
 * Find image_desc blocks (opener + closer) that have no preceding image
 * `![…](…)` line — i.e. the description has nothing to attach to.
 *
 * Returned as orphan-block records. The lexer would still emit these as
 * image_desc blocks (they're well-formed), so they wouldn't be caught by
 * the orphan-opener check. They're informational warnings only.
 */
export function findOrphanImageDescBlocks(body: string): OrphanImageDesc[] {
  const lines = body.split("\n");
  const results: OrphanImageDesc[] = [];
  let i = 0;
  while (i < lines.length) {
    if (OPENER_RE.test(lines[i]!)) {
      const openerLine = i + 1;
      const openerText = lines[i]!;
      let j = i + 1;
      while (j < lines.length && !CLOSER_RE.test(lines[j]!)) j++;
      if (j < lines.length && CLOSER_RE.test(lines[j]!)) {
        // Has a closer. Check preceding image.
        const hasImage = hasPrecedingImage(lines, i);
        if (!hasImage) {
          results.push({ line: openerLine, text: openerText });
        }
        i = j + 1;
      } else {
        // Orphan opener — caught by the opener check, not duplicated here.
        i = j + 1;
      }
    } else {
      i++;
    }
  }
  return results;
}

function hasPrecedingImage(lines: string[], openerIdx: number): boolean {
  for (let k = openerIdx - 1; k >= 0; k--) {
    const t = lines[k]!.trim();
    if (t === "") continue;
    return /^!\[.*?\]\(.*\)\s*$/.test(t) || /^<img\b/i.test(t);
  }
  return false;
}
