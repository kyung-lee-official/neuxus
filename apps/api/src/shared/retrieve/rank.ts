export type ChildHit = {
  childId: string;
  parentId: string;
  pageId: string;
  childText: string;
  score: number;
};

export type RetrievedParent = {
  parentId: string;
  pageId: string;
  slug: string;
  title: string;
  text: string;
  score: number;
};

/** First occurrence of each `parentId` (hits must already be best-first). */
export function uniqueParentIdsByBestScore(hits: ChildHit[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const hit of hits) {
    if (seen.has(hit.parentId)) continue;
    seen.add(hit.parentId);
    ids.push(hit.parentId);
  }
  return ids;
}

export function scoreByParentFromHits(hits: ChildHit[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const hit of hits) {
    if (!scores.has(hit.parentId)) scores.set(hit.parentId, hit.score);
  }
  return scores;
}

/**
 * Keep score order. Stop at `maxParents`. Stop when adding the next parent
 * would exceed `maxCharacters`, except always keep the first parent.
 */
export function capParents(
  parents: RetrievedParent[],
  maxParents: number,
  maxCharacters: number,
): RetrievedParent[] {
  const out: RetrievedParent[] = [];
  let used = 0;
  for (const parent of parents) {
    if (out.length >= maxParents) break;
    const next = used + parent.text.length;
    if (out.length > 0 && next > maxCharacters) break;
    out.push(parent);
    used = next;
  }
  return out;
}
