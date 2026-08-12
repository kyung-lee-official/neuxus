import { ElysiaCustomStatusResponse } from "elysia";

/** True when `throw status(...)` / `return status(...)` produced this value. */
export function isHttpStatus(
  err: unknown,
): err is ElysiaCustomStatusResponse<number, unknown, number> {
  return err instanceof ElysiaCustomStatusResponse;
}
