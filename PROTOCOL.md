# neuxus Core Protocol

This document defines the HTTP/JSON protocol between client apps and the stateless neuxus core. A request sends the question, knowledge base, user, and optional context. The core returns a structured result with citations, or a structured no-answer result.

The core does not store sessions, messages, memory, or user accounts, and it does not return commands. Client apps own those things and decide what to do with a result.

---

## HTTP

- Base URL: `https://<core-host>`
- Content type: `application/json; charset=utf-8`
- Errors: `application/problem+json`
- `GET /health` does not require a token.

### Endpoints

| Method | Path               | Purpose                                      | Scope            |
| ------ | ------------------ | -------------------------------------------- | ---------------- |
| `POST` | `/answer`          | Answer with citations, or a no-answer result | `answer:read`    |
| `POST` | `/retrieve`        | Evidence only, no LLM answer                 | `retrieve:read`  |
| `GET`  | `/knowledge-bases` | List knowledge bases                         | `knowledge:read` |
| `GET`  | `/health`          | Health check                                 | none             |

### Request headers

- `X-Request-Id` is optional. If supplied, the core returns it as `requestId`. If omitted, the core generates one.
- `POST /answer` and `POST /retrieve` are read-only.
- Streaming is not supported.

---

## Authentication and user

Every endpoint except `GET /health` requires a **service token**:

```http
Authorization: Bearer <service-token>
```

A service token belongs to a client app, not to an end user. Each token has scopes:

| Scope            | Grants                 |
| ---------------- | ---------------------- |
| `answer:read`    | `POST /answer`         |
| `retrieve:read`  | `POST /retrieve`       |
| `knowledge:read` | `GET /knowledge-bases` |

The client app verifies its own users, then calls the core with its service token and sends the user it is acting for in the `principal` object:

```json
{
  "principal": {
    "userId": "discord:123456789",
    "role": "member"
  }
}
```

- `principal.userId` is a string ID used for logging and context.
- `principal.role` is optional and is `"admin"` or `"member"`.
- The core trusts the calling app to send the principal. It does not own user accounts.
- Do not send an end-user API key to the core.

---

## `POST /answer`

### Request

```ts
type AnswerRequest = {
  knowledgeBaseId: string;
  question: string;
  principal: {
    userId: string;
    role?: "admin" | "member";
  };
  context?: {
    recentTurns?: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    memories?: Array<{
      slug?: string;
      content: string;
    }>;
    locale?: string;
  };
  options?: {
    /** Optional; the core caps these to its server settings. */
    childLimit?: number;
    maxParents?: number;
    maxCharacters?: number;
    /** Include the model's raw output in the response. Default: false. */
    includeRaw?: boolean;
  };
};
```

Notes:

- `question` is the current user question, not a prompt.
- `recentTurns` are for follow-ups and references like "it" or "that one". Send at most the 20 most recent turns; the core may shorten them.
- `memories` are short user-specific notes. The core uses them but does not store them.
- `locale` is an optional language hint (BCP 47, for example `en-US`).
- `options` are optional; the core caps them to its server settings. The response returns the limits that were used.

Example:

```json
{
  "knowledgeBaseId": "docs-chitubox-com",
  "question": "Which profiles support layer height 0.2 mm?",
  "principal": {
    "userId": "desktop:user-42",
    "role": "member"
  },
  "context": {
    "recentTurns": [
      { "role": "user", "content": "I print at 0.1 mm." },
      { "role": "assistant", "content": "That is a fine layer height." }
    ],
    "memories": [
      { "slug": "printer", "content": "The user owns a resin printer." }
    ],
    "locale": "en-US"
  },
  "options": {
    "maxParents": 8,
    "includeRaw": false
  }
}
```

### Response

```ts
type AnswerResponse = {
  requestId: string;
  knowledgeBaseId: string;
  model: string; // "{providerId}::{modelId}"
  latencyMs: number;
  limits: {
    childLimit: number;
    maxParents: number;
    maxCharacters: number;
  };
  outcome: Outcome;
};
```

Every successful request returns `200` and exactly one `outcome`.

### Outcome

```ts
type Citation = {
  knowledgeBaseId: string;
  parentId: string;
  pageId: string;
  title: string;
  /** Exact text from the cited parent. */
  quote: string;
  /** Retrieval score; higher is better. Scores from different embedding models cannot be compared. */
  score: number;
};

type Signals = {
  /** Child hits before duplicate parents are merged. */
  hits: number;
  /** Parents included in the answer prompt. */
  usedParents: number;
  /** Highest parent score, or null when there were no hits. */
  topScore: number | null;
  /** topScore minus the second parent score, or null with fewer than two parents. */
  margin: number | null;
  citedClaims: number;
  totalClaims: number;
  /** The prompt or context was shortened to fit the model's limit. */
  truncated: boolean;
};

type Outcome =
  | {
      kind: "answered";
      answer: string;
      citations: Citation[];
      signals: Signals;
      /** Present only when options.includeRaw is true. Not part of the protocol. */
      raw?: string;
    }
  | {
      kind: "partial";
      answer: string;
      citations: Citation[];
      /** Parts the knowledge base did not support. */
      missing: string[];
      signals: Signals;
      raw?: string;
    }
  | {
      kind: "insufficient_context";
      reason:
        | "no_hits"
        | "low_relevance"
        | "unsupported_claims"
        | "conflicting_evidence"
        | "budget_exceeded";
      /** Parts the knowledge base did not support. */
      missing: string[];
      /** Next steps for a person to read. Not commands. */
      suggestions: string[];
      signals: Signals;
    }
  | {
      kind: "needs_clarification";
      /** Questions the caller should ask the user. */
      questions: string[];
      signals: Signals;
    };
```

### Outcome rules

| Kind                   | Rules                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `answered`             | At least one citation. `signals.citedClaims > 0` and `signals.citedClaims === signals.totalClaims`.   |
| `partial`              | At least one citation and at least one missing part. `0 < signals.citedClaims < signals.totalClaims`. |
| `insufficient_context` | No supported answer. `signals.citedClaims === 0`. `reason` explains why.                              |
| `needs_clarification`  | The question is unclear. No answer and no citations.                                                  |

`answer` is the checked answer built from cited claims. `raw` is the model's raw output and is not checked; it is present only when requested and must not be treated as part of the protocol.

### Examples

A supported answer:

```json
{
  "requestId": "6f1c2e3a-9a4e-4f5b-9c1d-2b7e8a0f1234",
  "knowledgeBaseId": "docs-chitubox-com",
  "model": "deepseek::deepseek-flash",
  "latencyMs": 842,
  "limits": { "childLimit": 24, "maxParents": 8, "maxCharacters": 12000 },
  "outcome": {
    "kind": "answered",
    "answer": "Use the 0.2 mm profile when your resin and exposure settings are calibrated for it.",
    "citations": [
      {
        "knowledgeBaseId": "docs-chitubox-com",
        "parentId": "kb-parent-17",
        "pageId": "academy/layer-height",
        "title": "Effects of layer height",
        "quote": "A 0.2 mm layer height is supported when the exposure time is adjusted.",
        "score": 0.87
      }
    ],
    "signals": {
      "hits": 24,
      "usedParents": 3,
      "topScore": 0.87,
      "margin": 0.14,
      "citedClaims": 1,
      "totalClaims": 1,
      "truncated": false
    }
  }
}
```

Nothing relevant in the knowledge base:

```json
{
  "requestId": "6f1c2e3a-9a4e-4f5b-9c1d-2b7e8a0f1234",
  "knowledgeBaseId": "docs-chitubox-com",
  "model": "deepseek::deepseek-flash",
  "latencyMs": 61,
  "limits": { "childLimit": 24, "maxParents": 8, "maxCharacters": 12000 },
  "outcome": {
    "kind": "insufficient_context",
    "reason": "no_hits",
    "missing": ["laser cutter calibration"],
    "suggestions": [
      "Ask about resin printers or exposure settings instead.",
      "Add a knowledge base that covers laser cutters."
    ],
    "signals": {
      "hits": 0,
      "usedParents": 0,
      "topScore": null,
      "margin": null,
      "citedClaims": 0,
      "totalClaims": 0,
      "truncated": false
    }
  }
}
```

The question is unclear:

```json
{
  "requestId": "6f1c2e3a-9a4e-4f5b-9c1d-2b7e8a0f1234",
  "knowledgeBaseId": "docs-chitubox-com",
  "model": "deepseek::deepseek-flash",
  "latencyMs": 44,
  "limits": { "childLimit": 24, "maxParents": 8, "maxCharacters": 12000 },
  "outcome": {
    "kind": "needs_clarification",
    "questions": [
      "Do you mean the layer height setting or the exposure time setting?",
      "Which printer model are you using?"
    ],
    "signals": {
      "hits": 0,
      "usedParents": 0,
      "topScore": null,
      "margin": null,
      "citedClaims": 0,
      "totalClaims": 0,
      "truncated": false
    }
  }
}
```

---

## `POST /retrieve`

Returns evidence only. It does not call the LLM. Use it when the client app wants to build its own answer.

### Request

```ts
type RetrieveRequest = {
  knowledgeBaseId: string;
  question: string;
  principal: {
    userId: string;
    role?: "admin" | "member";
  };
  options?: {
    childLimit?: number;
    maxParents?: number;
    maxCharacters?: number;
    /** Include raw top-K child hits. Default: false. */
    includeChildren?: boolean;
  };
};
```

### Response

```ts
type RetrieveResponse = {
  requestId: string;
  knowledgeBaseId: string;
  embeddingModel: string;
  latencyMs: number;
  limits: {
    childLimit: number;
    maxParents: number;
    maxCharacters: number;
  };
  outcome:
    | {
        kind: "hits";
        parents: Array<{
          knowledgeBaseId: string;
          parentId: string;
          pageId: string;
          title: string;
          text: string;
          score: number;
        }>;
        images: Array<{
          knowledgeBaseId: string;
          pageId: string;
          title: string;
          imagePath: string;
          description: string;
          score: number;
        }>;
        children?: Array<{
          childId: string;
          parentId: string;
          pageId: string;
          text: string;
          score: number;
        }>;
        signals: {
          hits: number;
          usedParents: number;
          topScore: number | null;
          margin: number | null;
          truncated: boolean;
        };
      }
    | {
        kind: "no_hits";
        reason: "no_hits";
        signals: {
          hits: 0;
          usedParents: 0;
          topScore: null;
          margin: null;
          truncated: boolean;
        };
      };
};
```

`children` is present only when `includeChildren` is true.

---

## `GET /knowledge-bases`

Lists knowledge bases so client apps can let users choose one.

```json
{
  "knowledgeBases": [
    {
      "id": "docs-chitubox-com",
      "name": "CHITUBOX docs",
      "writable": false,
      "createdAt": "2026-01-10T12:00:00.000Z"
    }
  ]
}
```

The list is sorted oldest first. It contains no page content.

---

## Errors

Knowledge outcomes return `200`. HTTP and request failures use `application/problem+json`, based on RFC 9457:

```json
{
  "type": "https://docs.neuxus.example/errors/knowledge-base-not-found",
  "title": "Knowledge base not found",
  "status": 404,
  "detail": "No knowledge base with id 'docs-missing'.",
  "instance": "/answer",
  "code": "knowledge_base_not_found",
  "requestId": "6f1c2e3a-9a4e-4f5b-9c1d-2b7e8a0f1234",
  "retryable": false
}
```

### Status codes

| Status | When                                               | `retryable` |
| ------ | -------------------------------------------------- | ----------- |
| `400`  | Malformed JSON, missing `question`, invalid limits | `false`     |
| `401`  | Missing or invalid service token                   | `false`     |
| `403`  | Token lacks the required scope                     | `false`     |
| `404`  | Unknown `knowledgeBaseId`                          | `false`     |
| `409`  | Not used by answer/retrieve                        | `false`     |
| `413`  | Request body too large                             | `false`     |
| `429`  | Rate limited; wait for `Retry-After`               | `true`      |
| `500`  | Unexpected core failure                            | `false`     |
| `502`  | Model or embedding provider failed                 | `true`      |
| `503`  | Core is unavailable or the model is not configured | `true`      |
| `504`  | Model provider timed out                           | `true`      |

### Key rules

- An empty knowledge base or a query with no relevant evidence is `200` with `insufficient_context` / `reason: "no_hits"`. It is not `404`.
- An unknown knowledge base is `404`. It is not `insufficient_context`.
- A model provider failure is `502`/`504`. It is not `insufficient_context`.
- Do not retry a `200 insufficient_context`. Retrying will not add knowledge.
- Retry `429`, `502`, `503`, and `504` after waiting.

---

## What outcomes mean

| Kind                   | Meaning                                                             | What the app should do                                                |
| ---------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `answered`             | The knowledge base supports the answer; every claim has a citation. | Use it.                                                               |
| `partial`              | Some claims are supported; `missing` lists the rest.                | Show it with a warning, or confirm before acting.                     |
| `insufficient_context` | The knowledge base does not support an answer.                      | Fall back, or say the knowledge base does not cover it. Do not retry. |
| `needs_clarification`  | The question is unclear.                                            | Ask the returned `questions`. Do not guess.                           |

Never build actions from `raw` or treat `answer` as a command. The core does not return commands.
