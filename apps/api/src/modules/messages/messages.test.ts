import { describe, expect, test } from "bun:test";
import { ProtocolError } from "../../shared/protocol.ts";
import type {
  RetrievedImage,
  RetrievedParent,
} from "../knowledge/retriever/index.ts";
import { formatKnowledgeBlock } from "./format.ts";
import { neuxusSseStream } from "./stream.ts";
import type { NeuxusExtension } from "./types.ts";
import {
  humanTurnFrom,
  messagesBody,
  messagesHeaders,
  messagesWithKnowledge,
} from "./validate.ts";

function parent(overrides: Partial<RetrievedParent> = {}): RetrievedParent {
  return {
    parentId: "guide/relay:par:0",
    pageId: "guide/relay",
    title: "North Quay Relay",
    text: "## Wiring\n\n![North quay](assets/wiring.png)\n\nThe relay sits between the two quays.",
    score: 0.9,
    ...overrides,
  };
}

function image(overrides: Partial<RetrievedImage> = {}): RetrievedImage {
  return {
    pageId: "guide/relay",
    title: "North Quay Relay",
    imagePath: "guide/assets/wiring.png",
    description: "A relay switch between two quays, with a 12V line labeled A.",
    score: 0.8,
    ...overrides,
  };
}

describe("formatKnowledgeBlock", () => {
  test("labels the parent page and folds an attached image", () => {
    const formatted = formatKnowledgeBlock("docs", [parent()], [image()]);
    if (!formatted) throw new Error("expected formatted knowledge");
    expect(formatted.block).toContain('<knowledge base="docs">');
    expect(formatted.block).toContain(
      'From page "guide/relay" (title "North Quay Relay"):',
    );
    expect(formatted.block).toContain(
      "A relay switch between two quays, with a 12V line labeled A.",
    );
    expect(formatted.block).not.toContain("![North quay]");
    expect(formatted.sources).toHaveLength(1);
    expect(formatted.sources[0]?.quote).toContain(
      "A relay switch between two quays, with a 12V line labeled A.",
    );
  });

  test("appends an unmatched image as a standalone sentence", () => {
    const formatted = formatKnowledgeBlock(
      "docs",
      [parent()],
      [image({ pageId: "other", imagePath: "other.png", title: "Other Page" })],
    );
    if (!formatted) throw new Error("expected formatted knowledge");
    expect(formatted.block).toContain("![North quay](assets/wiring.png)");
    expect(formatted.block).toContain(
      'An image from page "other" (title "Other Page") shows: A relay switch between two quays, with a 12V line labeled A.',
    );
  });

  test("returns null when there is no evidence", () => {
    expect(formatKnowledgeBlock("docs", [], [])).toBeNull();
  });
});

describe("humanTurnFrom", () => {
  test("selects the last user message with text", () => {
    const body = messagesBody({
      model: "deepseek::deepseek-flash",
      max_tokens: 10,
      messages: [
        { role: "assistant", content: "hi" },
        { role: "user", content: "question" },
      ],
    });
    const turn = humanTurnFrom(body.messages);
    expect(turn?.index).toBe(1);
    expect(turn?.text).toBe("question");
  });

  test("ignores a trailing tool result turn", () => {
    const body = messagesBody({
      model: "deepseek::deepseek-flash",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: "result",
            },
          ],
        },
      ],
    });
    expect(humanTurnFrom(body.messages)).toBeNull();
  });

  test("prepends the block without modifying the original turn", () => {
    const body = messagesBody({
      model: "deepseek::deepseek-flash",
      max_tokens: 10,
      messages: [{ role: "user", content: "question" }],
    });
    const turn = humanTurnFrom(body.messages);
    if (!turn) throw new Error("expected a human turn");
    const messages = messagesWithKnowledge(
      body.messages,
      turn,
      "<knowledge></knowledge>",
    );
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "<knowledge></knowledge>" },
      { type: "text", text: "question" },
    ]);
    expect(body.messages[0]?.content).toBe("question");
  });
});

describe("neuxusSseStream", () => {
  test("adds neuxus to message_start and leaves deltas unchanged", async () => {
    const extension: NeuxusExtension = {
      protocolVersion: "1",
      requestId: "req-1",
      knowledgeBaseId: "docs",
      enriched: true,
      enrichment: { turnIndex: 0, injectedChars: 12, truncated: false },
      upstream: { provider: "deepseek", model: "deepseek-flash" },
      sources: [],
      signals: { hits: 1, usedParents: 0, topScore: null, margin: null },
    };
    const encoder = new TextEncoder();
    const first = encoder.encode(
      'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","model":"upstream","content":[]}}\n\n',
    );
    const second = encoder.encode(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
    );
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
        controller.enqueue(second);
        controller.close();
      },
    });

    const text = await new Response(
      neuxusSseStream(source, extension, true, "deepseek::deepseek-flash"),
    ).text();
    const startData = text
      .split("\n")
      .find(
        (line) => line.startsWith("data: ") && line.includes("message_start"),
      );
    if (!startData) throw new Error("expected message_start");
    const parsed = JSON.parse(startData.slice(6)) as {
      message: { model: string; neuxus: { requestId: string } };
    };
    expect(parsed.message.model).toBe("deepseek::deepseek-flash");
    expect(parsed.message.neuxus.requestId).toBe("req-1");
    expect(text).toContain('"type":"content_block_delta"');
  });
});

describe("request validation", () => {
  test("requires the knowledge-base header", () => {
    try {
      messagesHeaders({ "anthropic-version": "2023-06-01" });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError);
      expect((error as ProtocolError).code).toBe("missing_knowledge_base");
    }
  });

  test("accepts stream as a boolean", () => {
    const body = messagesBody({
      model: "deepseek::deepseek-flash",
      max_tokens: 10,
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    });
    expect(body.stream).toBe(true);
  });
});
