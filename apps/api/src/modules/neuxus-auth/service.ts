import { timingSafeEqual } from "node:crypto";
import { ProtocolError } from "../../shared/protocol.ts";

export abstract class NeuxusAuth {
  static expectedToken(): string {
    return process.env.NEUXUS_SERVICE_TOKEN?.trim() ?? "";
  }

  static isValid(headers: Record<string, string | undefined>): boolean {
    const expected = NeuxusAuth.expectedToken();
    if (!expected) return false;

    const header = headers.authorization ?? headers.Authorization ?? "";
    const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const apiKey =
      headers["x-api-key"]?.trim() ?? headers["X-Api-Key"]?.trim() ?? "";
    const presented = bearer || apiKey;
    if (!presented) return false;

    const expectedBytes = Buffer.from(expected);
    const presentedBytes = Buffer.from(presented);
    if (expectedBytes.length !== presentedBytes.length) return false;
    return timingSafeEqual(expectedBytes, presentedBytes);
  }

  static unauthorized(): never {
    throw new ProtocolError(
      401,
      "authentication_error",
      "invalid_token",
      "Unauthorized. Use the neuxus service token.",
    );
  }
}
