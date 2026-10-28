# neuxus Core Protocol

This document defines the HTTP/JSON protocol between downstream applications and the stateless neuxus core. A request supplies the question, knowledge base, principal, and optional context. The core returns a structured knowledge outcome with citations, or a typed non-answer.

The core does not own sessions, messages, memory, or end-user accounts, and it does not return commands. Downstream applications own those concerns and decide what to do with an outcome.

---

## Transport

- Base URL: `https://<core-host>`
- Content type: `application/json; charset=utf-8`
- Errors: `application/problem+json`
- `GET /health` is unauthenticated.

### Endpoints

| Method | Path               | Purpose                                | Scope            |
| ------ | ------------------ | -------------------------------------- | ---------------- |
| `POST` | `/answer`          | Grounded answer or explicit non-answer | `answer:read`    |
| `POST` | `/retrieve`        | Evidence only, no synthesis            | `retrieve:read`  |
| `GET`  | `/knowledge-bases` | Discover available knowledge bases     | `knowledge:read` |
| `GET`  | `/health`          | Liveness                               | none             |

### Request metadata

- `X-Request-Id` is optional. If supplied, the core echoes it as `requestId`. If omitted, the core generates one.
- `traceparent` (W3C Trace Context) is optional and is attached to core logs.
- `POST /answer` and `POST /retrieve` are read-only. They do not require an `Idempotency-Key`.
- Recommended client timeout for `/answer`: 60 seconds. Streaming is not supported.

---

## Authentication and principal

Every endpoint except `GET /health` requires a **service token**:

```http
Authorization: Bearer <service-token>
```

A service token belongs to a downstream application, not to an end user. Each token has scopes:

| Scope            | Grants                 |
| ---------------- | ---------------------- |
| `answer:read`    | `POST /answer`         |
| `retrieve:read`  | `POST /retrieve`       |
| `knowledge:read` | `GET /knowledge-bases` |

The downstream app authenticates its own end users, then calls the core with its service token and asserts the end-user principal in the request body:

```json
{
  "principal": {
    "userId": "discord:123456789",
    "role": "member"
  }
}
```

- `principal.userId` is an opaque string used for logging and context scoping.
- `principal.role` is optional and is `"admin"` or `"member"`.
- The core trusts the calling service to assert the principal. It does not own end-user accounts.
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
    /** Hints; the core clamps these to its server settings. */
    childLimit?: number;
    maxParents?: number;
    maxCharacters?: number;
    /** Include the raw model output in the response. Default: false. */
    includeRaw?: boolean;
  };
};
```

Guidance:

- `question` is the current user question, not a prompt.
- `recentTurns` are for follow-ups and coreference. Send at most the most recent 20 turns; the core may truncate.
- `memories` are user-specific context snippets. The core uses them but does not store them.
- `locale` is an optional language hint (BCP 47, for example `en-US`).
- `options` are hints. The response returns the resolved limits.

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
  /** Exact substring of the cited parent text. */
  quote: string;
  /** Retriever score; higher is better. Not comparable across embedding models. */
  score: number;
};

type Signals = {
  /** Raw child hits before parent dedupe. */
  hits: number;
  /** Parents included in the synthesis prompt. */
  usedParents: number;
  /** Highest parent score, or null when there were no hits. */
  topScore: number | null;
  /** topScore minus the second parent score, or null with fewer than two parents. */
  margin: number | null;
  citedClaims: number;
  totalClaims: number;
  /** The prompt or context was truncated to fit the model budget. */
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
      /** Aspects the knowledge base did not support. */
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
      /** Aspects the knowledge base did not support. */
      missing: string[];
      /** Human-readable next steps. Not commands. */
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

### Outcome invariants

| Kind                   | Guarantees                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `answered`             | At least one citation. `signals.citedClaims > 0` and `signals.citedClaims === signals.totalClaims`.     |
| `partial`              | At least one citation and at least one missing aspect. `0 < signals.citedClaims < signals.totalClaims`. |
| `insufficient_context` | No grounded answer. `signals.citedClaims === 0`. `reason` explains why.                                 |
| `needs_clarification`  | The question is ambiguous. No answer and no citations.                                                  |

`answer` is the validated answer assembled from grounded claims. `raw` is unvalidated model output; it is present only when requested and must never be treated as the protocol.

### Examples

Clearly grounded:

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

The question is ambiguous:

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

Evidence only. No LLM call. Use this when the downstream app wants to do its own synthesis.

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

Discovery for downstream apps that let users choose a knowledge base.

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

The response is ordered by creation time, oldest first. It contains no page content.

---

## Errors

Semantic outcomes are `200`. Transport and request failures use `application/problem+json`, based on RFC 9457:

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

| Status | When                                                 | `retryable` |
| ------ | ---------------------------------------------------- | ----------- |
| `400`  | Malformed JSON, missing `question`, invalid limits   | `false`     |
| `401`  | Missing or invalid service token                     | `false`     |
| `403`  | Token lacks the required scope                       | `false`     |
| `404`  | Unknown `knowledgeBaseId`                            | `false`     |
| `409`  | Reserved; not used by answer/retrieve                | `false`     |
| `413`  | Request body too large                               | `false`     |
| `429`  | Rate limited; honor `Retry-After`                    | `true`      |
| `500`  | Unexpected core failure                              | `false`     |
| `502`  | Upstream model or embedding provider failed          | `true`      |
| `503`  | Core temporarily unavailable or model not configured | `true`      |
| `504`  | Upstream provider timed out                          | `true`      |

### Important distinctions

- An empty knowledge base or a query with no relevant evidence is `200` with `insufficient_context` / `reason: "no_hits"`. It is not `404`.
- An unknown knowledge base is `404`. It is not `insufficient_context`.
- A model provider failure is `502`/`504`. It is not `insufficient_context`.
- Do not retry a `200 insufficient_context`. Retrying will not add knowledge.
- Do retry `429`, `502`, `503`, and `504` with backoff.

---

## Interpreting outcomes

| Kind                   | Meaning                                                       | Downstream action                                                    |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `answered`             | The knowledge base supports the answer; every claim is cited. | Use it.                                                              |
| `partial`              | Some claims are grounded; `missing` lists what is not.        | Show it with a caveat, or confirm before acting.                     |
| `insufficient_context` | The knowledge base does not support an answer.                | Fall back or say the knowledge base does not cover it. Do not retry. |
| `needs_clarification`  | The question is ambiguous.                                    | Ask the returned `questions`. Do not guess.                          |

Never derive actions from `raw` or parse `answer` as a command. The core does not return commands.
