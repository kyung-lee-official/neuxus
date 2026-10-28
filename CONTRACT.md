# neuxus Core Contract

This document defines the HTTP/JSON contract between the stateless **neuxus core** and any downstream application: a chat app, a desktop client, a Discord bot, or an agent runtime.

The core's job is to answer from a knowledge base and report, in a machine-readable way, whether the knowledge base actually supports an answer. It does not own conversations, sessions, messages, memory, end-user accounts, or UI actions.

---

## 1. Design principles

1. **The core is stateless.** A request carries everything the core needs. No session ID, no conversation lookup, no message persistence.
2. **Context is input, not state.** The caller supplies recent turns and memory snippets. The core uses them and forgets them.
3. **Knowledge outcomes are values, not prose.** "I cannot answer from this knowledge base" is a structured outcome on `200`, not a natural-language sentence and not an HTTP error.
4. **Evidence is first-class.** Every grounded claim carries citations that the caller can verify.
5. **The core is downstream-agnostic.** It never returns UI commands, platform-specific payloads, or consumer-specific fields. Downstream apps decide what to do with the result.
6. **Transport failures are separate from knowledge outcomes.** `4xx`/`5xx` mean the request or the service failed. `200` means the request succeeded and the outcome is one of the defined knowledge outcomes.

---

## 2. Roles and boundaries

| Role                     | Owns                                                                                                                   | Does not own                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **neuxus core**          | retrieval, relevance gate, grounded synthesis, citations, outcome classification, knowledge bases, model configuration | sessions, messages, memory, end-user accounts, UI actions |
| **Downstream app**       | end-user identity, sessions, message history, memory, context assembly, presentation, action execution                 | knowledge, evidence, abstention rules                     |
| **Service token issuer** | credentials for downstream apps and their scopes                                                                       | end-user identity inside the downstream app               |

The core never executes a side effect on behalf of a downstream app. A downstream agent may act on an `answered` outcome, but the action belongs to that agent.

---

## 3. Transport

- Base URL: `https://<core-host>`
- Content type: `application/json; charset=utf-8`
- Errors: `application/problem+json` (see section 8)
- `GET /health` is unauthenticated and outside the contract.

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

## 4. Authentication and principal

Every endpoint requires a **service token**:

```http
Authorization: Bearer <service-token>
```

A service token belongs to a downstream application, not to an end user. Each token has a set of scopes:

| Scope            | Grants                 |
| ---------------- | ---------------------- |
| `answer:read`    | `POST /answer`         |
| `retrieve:read`  | `POST /retrieve`       |
| `knowledge:read` | `GET /knowledge-bases` |

The downstream app authenticates its own end users. It then calls the core with its service token and asserts the end-user principal in the request body:

```json
{
  "principal": {
    "userId": "discord:123456789",
    "role": "member"
  }
}
```

- `principal.userId` is an opaque string. The core uses it for logging and context scoping, not for authentication.
- `principal.role` is optional and is `"admin"` or `"member"`.
- In a single-tenant deployment, the core trusts the calling service to assert the principal. The core does not own an end-user directory.
- If the core later serves multiple tenants, it must add `tenantId` to the principal and enforce knowledge-base ownership **before** retrieval. That is a future major change.

The core does not accept end-user API keys. Do not send a downstream app's end-user key to the core.

---

## 5. `POST /answer`

### 5.1 Request

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

- `question` is the current user question. It is not a prompt.
- `recentTurns` are for follow-ups and coreference. Send the most recent 20 turns at most; the core may truncate to fit its budget.
- `memories` are user-specific context snippets. The core may use them but does not store them.
- `locale` is an optional language hint (BCP 47, for example `en-US`). It does not change the outcome semantics.
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

### 5.2 Response envelope

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

### 5.3 Outcome

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
      /** Present only when options.includeRaw is true. Not part of the contract. */
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

### 5.4 Outcome invariants

| Kind                   | Guarantees                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `answered`             | At least one citation. `signals.citedClaims > 0` and `signals.citedClaims === signals.totalClaims`.     |
| `partial`              | At least one citation and at least one missing aspect. `0 < signals.citedClaims < signals.totalClaims`. |
| `insufficient_context` | No grounded answer. `signals.citedClaims === 0`. `reason` explains why.                                 |
| `needs_clarification`  | The question is ambiguous. No answer and no citations.                                                  |

`answer` is the validated answer assembled from grounded claims. `raw` is the unvalidated model output; it is present only when the caller asks for it and must never be treated as the contract.

### 5.5 Examples

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

The knowledge base has nothing relevant:

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

## 6. `POST /retrieve`

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

## 7. `GET /knowledge-bases`

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

## 8. Errors

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

## 9. Consumer rules

### Chat app

1. Own the session and message history.
2. Assemble `context.recentTurns` and `context.memories` before calling the core.
3. Persist the user message and the returned `outcome.answer` (or a placeholder for non-answers) in its own database.
4. Render `answered` and `partial` with citations.
5. On `insufficient_context`, show that the knowledge base does not cover the question; optionally show `suggestions`.
6. On `needs_clarification`, ask the user the returned `questions`.
7. On `4xx`, show an error. On `5xx`/`429`, retry with backoff where allowed.

### Agent or desktop client

1. Act only on `answered`.
2. On `partial`, act only with confirmation, or ask a follow-up.
3. On `needs_clarification`, ask; do not guess.
4. On `insufficient_context`, fall back to another tool or refuse.
5. Never derive actions from `raw`.
6. Never parse `answer` as a command. The core does not return commands.

### All consumers

- Treat `kind` as the primary signal.
- Never treat a `200` as "the model said something useful." Inspect `kind` and `signals`.
- Do not re-derive confidence from `signals` if `kind` already answers the question. `signals` is for observability and policy thresholds.
- Do not send secrets, credentials, or unnecessary personal data in `question`, `context`, or `memories`.

---

## 10. Non-goals

- Session, message, or memory storage in the core.
- End-user accounts, login, or OAuth.
- Multi-tenant isolation and per-knowledge-base authorization.
- UI commands, tool calls, or action execution.
- Token streaming or partial responses.
- Corpus/admin operations. Those are a separate admin contract.
- Multi-knowledge-base requests. The contract is one knowledge base per request.

---

## 11. Compatibility

- New optional fields may be added.
- New `kind`, `reason`, or error `code` values may be added. Consumers must treat unknown values as "no action" and log them.
- Existing fields will not change meaning.
- Breaking changes require explicit coordination; do not change field semantics in place.
- Deprecations are announced with `Deprecation` and `Sunset` headers on the affected endpoint.

---

## 12. Implementation notes

- The canonical schema lives in `packages/protocol` and is exported as JSON Schema and OpenAPI from the existing TypeBox models.
- The core must expose this contract without importing chat/session/memory modules. The dependency direction is: chat imports core, never the reverse.
- The core must not read the chat database. The chat app must not read the core database.
- The core's logs may contain the asserted `principal.userId` as an opaque string. That does not make the core the owner of user identity.
- When this contract is implemented, the existing `POST /query` becomes a chat-app adapter. It is not part of this contract.

---

## 13. Decisions

These are the choices reflected in this contract:

1. One `knowledgeBaseId` per request; multi-knowledge-base is not supported.
2. `principal` is asserted in the body by the calling service.
3. Service tokens with scopes; end-user accounts live in the downstream app.
4. `raw` is opt-in and non-contractual.
5. `needs_clarification` is included.
6. No streaming.
7. Logging is core-owned for retrieval/synthesis; chat-owned for chat events.
8. Errors use RFC 9457 Problem Details with `code`, `requestId`, and `retryable`.
