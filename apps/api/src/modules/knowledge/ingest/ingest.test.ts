import { describe, expect, test } from "bun:test";
import { ingestMarkdown, normalizeBody } from "./index.ts";

describe("normalizeBody", () => {
  test("newlines, trailing spaces, final newline; idempotent", () => {
    const once = normalizeBody("hello  \r\nworld  ");
    expect(once).toBe("hello\nworld\n");
    expect(normalizeBody(once)).toBe(once);
  });

  test("already-normalized body is unchanged", () => {
    const body = "hello\n\nworld\n";
    expect(normalizeBody(body)).toBe(body);
  });
});

describe("ingestMarkdown", () => {
  test("strips leading YAML; title and tags are metadata", () => {
    const source = [
      "---",
      "title: North Quay Relay",
      "tags: [demo, kb]",
      "type: note",
      "---",
      "## Setup",
    ].join("\n");
    const result = ingestMarkdown(source);
    expect(result.title).toBe("North Quay Relay");
    expect(result.tags).toEqual(["demo", "kb"]);
    expect(result.type).toBe("note");
    expect(result.body).toBe("## Setup\n");
    expect(result.body.startsWith("---")).toBe(false);
  });

  test("YAML list tags", () => {
    const source = [
      "---",
      "title: X",
      "tags:",
      "  - a",
      "  - b",
      "---",
      "Hi",
    ].join("\n");
    expect(ingestMarkdown(source).tags).toEqual(["a", "b"]);
  });

  test("does not strip a later --- thematic break", () => {
    const source = "## A\n\n---\n\n## B\n";
    const result = ingestMarkdown(source);
    expect(result.body).toContain("---");
    expect(result.title).toBe("");
  });

  test("unclosed opening --- is not frontmatter", () => {
    const source = "---\nnot closed\n\n## Setup\n";
    const result = ingestMarkdown(source);
    expect(result.body.startsWith("---\n")).toBe(true);
    expect(result.title).toBe("");
  });

  test("CRLF leading frontmatter", () => {
    const source = "---\r\ntitle: Foo\r\n---\r\nBody  \r\n";
    const result = ingestMarkdown(source);
    expect(result.title).toBe("Foo");
    expect(result.body).toBe("Body\n");
  });
});
