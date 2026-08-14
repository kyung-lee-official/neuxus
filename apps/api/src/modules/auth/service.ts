import { status } from "elysia";
import { type AppUser, getUserByApiKey } from "../../shared/db.ts";

export abstract class Auth {
  static async resolveUserFromHeaders(
    headers: Record<string, string | undefined>,
  ): Promise<AppUser | null> {
    const header = headers.authorization ?? headers.Authorization ?? "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    const apiKey = match?.[1]?.trim();
    if (!apiKey) return null;
    return getUserByApiKey(apiKey);
  }

  static unauthorized() {
    return status(401, {
      error: "Unauthorized. Use Authorization: Bearer <api-key>.",
    });
  }

  static forbidden() {
    return status(403, { error: "Admin only." });
  }
}
