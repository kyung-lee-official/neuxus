import { createHash } from "node:crypto";

export type PageHashFields = {
  title: string;
  type: string | null;
  tags: string[];
  body: string;
};

/** Stable page skip-gate hash. @see docs/modern-knowledge-base-design/01-ingest.md */
export function pageContentHash(fields: PageHashFields): string {
  const payload = JSON.stringify({
    title: fields.title,
    type: fields.type ?? null,
    tags: [...fields.tags].sort(),
    body: fields.body,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** True when a stored page hash matches ingest fields (skip gate). */
export function hashesMatch(
  storedHash: string | null,
  fields: PageHashFields,
): boolean {
  return storedHash !== null && storedHash === pageContentHash(fields);
}
