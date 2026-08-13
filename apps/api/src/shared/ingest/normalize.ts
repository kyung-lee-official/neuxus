/** Canonical page `body`: newlines, no trailing spaces, one final `\n`. Idempotent. */

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function normalizeBody(text: string): string {
  const lines = normalizeNewlines(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));
  let body = lines.join("\n");
  if (!body.endsWith("\n")) body += "\n";
  return body;
}
