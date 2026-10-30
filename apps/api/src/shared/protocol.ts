/**
 * neuxus protocol errors: Anthropic's error envelope plus a stable
 * `X-Neuxus-Code`. Every `/v1/messages` and `/retrieve` failure uses this
 * shape; the global error handler serializes it.
 */

export type AnthropicErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "request_too_large"
  | "rate_limit_error"
  | "api_error";

export type NeuxusErrorCode =
  | "invalid_request"
  | "missing_knowledge_base"
  | "invalid_token"
  | "insufficient_scope"
  | "knowledge_base_not_found"
  | "model_not_found"
  | "request_too_large"
  | "rate_limited"
  | "internal_error"
  | "upstream_error"
  | "non_anthropic_upstream"
  | "model_not_configured"
  | "upstream_timeout";

export class ProtocolError extends Error {
  readonly statusCode: number;
  readonly errorType: AnthropicErrorType;
  readonly code: NeuxusErrorCode;

  constructor(
    statusCode: number,
    errorType: AnthropicErrorType,
    code: NeuxusErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProtocolError";
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.code = code;
  }
}

export function protocolErrorBody(error: ProtocolError) {
  return {
    type: "error" as const,
    error: { type: error.errorType, message: error.message },
  };
}

const requestIds = new WeakMap<Request, string>();

/** Echo the client's `X-Request-Id` or generate one per HTTP request. */
export function requestIdFrom(request: Request): string {
  const existing = requestIds.get(request);
  if (existing) return existing;
  const header = request.headers.get("x-request-id")?.trim();
  const id = header && header !== "" ? header : crypto.randomUUID();
  requestIds.set(request, id);
  return id;
}
