import { normalizeBody, normalizeNewlines } from "./normalize.ts";

export type IngestMarkdownResult = {
  title: string;
  type: string | null;
  tags: string[];
  body: string;
};

/**
 * Ingest a markdown file: strip leading YAML frontmatter, then normalize `body`.
 * `chunkify` never strips frontmatter; it may re-apply {@link normalizeBody}.
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */
export function ingestMarkdown(source: string): IngestMarkdownResult {
  const withNewlines = normalizeNewlines(source);
  const { yaml, rest } = splitLeadingFrontmatter(withNewlines);
  const meta = yaml == null ? emptyMeta() : parseFrontmatterYaml(yaml);
  return {
    title: meta.title,
    type: meta.type,
    tags: meta.tags,
    body: normalizeBody(rest),
  };
}

function emptyMeta(): { title: string; type: string | null; tags: string[] } {
  return { title: "", type: null, tags: [] };
}

/** Leading `---\n` … `---\n` (optional newline after closer). Otherwise no strip. */
function splitLeadingFrontmatter(text: string): {
  yaml: string | null;
  rest: string;
} {
  if (!text.startsWith("---\n")) {
    return { yaml: null, rest: text };
  }
  const afterOpen = 4;
  const closeAt = text.indexOf("\n---", afterOpen);
  if (closeAt === -1) {
    return { yaml: null, rest: text };
  }
  let restStart = closeAt + "\n---".length;
  if (text.charAt(restStart) === "\n") restStart += 1;
  return {
    yaml: text.slice(afterOpen, closeAt),
    rest: text.slice(restStart),
  };
}

function parseFrontmatterYaml(yaml: string): {
  title: string;
  type: string | null;
  tags: string[];
} {
  const meta = emptyMeta();
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const tagged = line.match(/^tags:[ \t]*(.*)$/);
    if (tagged) {
      const inline = tagged[1]!.trim();
      if (inline.startsWith("[") && inline.endsWith("]")) {
        meta.tags = splitInlineList(inline.slice(1, -1));
        i++;
        continue;
      }
      if (inline === "" || inline === "|") {
        const tags: string[] = [];
        i++;
        while (i < lines.length) {
          const item = lines[i]!.match(/^[ \t]*-[ \t]+(.*)$/);
          if (!item) break;
          const value = unquote(item[1]!.trim());
          if (value !== "") tags.push(value);
          i++;
        }
        meta.tags = tags;
        continue;
      }
      meta.tags = inline === "" ? [] : [unquote(inline)];
      i++;
      continue;
    }
    const keyed = line.match(/^(title|type):[ \t]*(.*)$/);
    if (keyed) {
      const value = unquote(keyed[2]!.trim());
      if (keyed[1] === "title") meta.title = value;
      else meta.type = value === "" ? null : value;
    }
    i++;
  }
  return meta;
}

function splitInlineList(inner: string): string[] {
  if (inner.trim() === "") return [];
  return inner
    .split(",")
    .map((part) => unquote(part.trim()))
    .filter((part) => part !== "");
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}
