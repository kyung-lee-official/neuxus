/**
 * Parses the per-page `<page>.meta.yaml` image policy map and computes the
 * canonical image paths its keys use.
 * @see docs/modern-knowledge-base-design/03.2-image-descriptions.md
 */

import { posix } from "node:path";

export const IMAGE_POLICIES = [
  "ignore",
  "manual",
  "vision-captioning",
] as const;
export type ImagePolicy = (typeof IMAGE_POLICIES)[number];

export type ImageMetaEntry = {
  policy: ImagePolicy;
  /** Present only when `policy: manual`. */
  description?: string;
};

export type ImageMetaParse =
  | { ok: true; entries: Map<string, ImageMetaEntry> }
  | { ok: false; error: string };

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isPolicy(value: string): value is ImagePolicy {
  return (IMAGE_POLICIES as readonly string[]).includes(value);
}

/**
 * Parse the `<page>.meta.yaml` subset: a top-level `path:` key whose indented
 * body holds `policy` (required) and `description` (required for `manual`;
 * `|`/`>` starts a block scalar). Unknown keys are rejected.
 */
export function parseImageMeta(yaml: string): ImageMetaParse {
  const entries = new Map<string, ImageMetaEntry>();
  const lines = yaml.split("\n");
  let path: string | null = null;
  let policy: ImagePolicy | null = null;
  let description: string | undefined;

  const commit = (): string | null => {
    if (path == null) return null;
    if (policy == null) return `image ${path} has no policy`;
    if (policy === "manual" && description == null) {
      return `image ${path} policy manual requires a description`;
    }
    entries.set(path, {
      policy,
      ...(description != null ? { description } : {}),
    });
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, "");
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (!/^\s/.test(line)) {
      const err = commit();
      if (err) return { ok: false, error: err };
      path = unquote(trimmed.replace(/:\s*$/, ""));
      policy = null;
      description = undefined;
      continue;
    }

    const m = line.match(/^\s+(policy|description):\s?(.*)$/);
    if (!m) return { ok: false, error: `unknown key: ${trimmed}` };
    if (m[1] === "policy") {
      const value = unquote(m[2]!.trim());
      if (!isPolicy(value)) {
        return { ok: false, error: `invalid policy for ${path}: ${value}` };
      }
      policy = value;
      continue;
    }

    const value = m[2]!.trim();
    if (value === "|" || value === ">") {
      const block: string[] = [];
      let base: number | null = null;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j]!.replace(/\r$/, "");
        if (l.trim() === "") {
          block.push("");
          continue;
        }
        const indent = l.length - l.trimStart().length;
        if (indent < 2) break;
        base ??= indent;
        block.push(l.slice(base));
      }
      i = j - 1;
      description = block.join("\n").replace(/\n+$/, "");
    } else {
      description = unquote(value);
    }
  }

  const err = commit();
  return err ? { ok: false, error: err } : { ok: true, entries };
}

/**
 * Docs-root-relative POSIX path for an image reference in a page. Returns null
 * when the reference is absolute or a URL (out of meta contract).
 */
export function canonicalImagePath(
  sourcePath: string,
  ref: string,
): string | null {
  if (ref === "") return null;
  if (ref.startsWith("/")) return null;
  if (/^[A-Za-z]:[\\/]/.test(ref)) return null;
  if (ref.includes("://")) return null;
  const dir = posix.dirname(sourcePath);
  return posix.normalize(posix.join(dir, ref));
}
