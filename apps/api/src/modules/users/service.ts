import { status } from "elysia";
import { isoFromDate } from "../../shared/serialize.ts";
import { ChatMessage } from "../personal-data/chat-messages/service.ts";
import {
  ChatSession,
  sessionJson,
} from "../personal-data/chat-sessions/service.ts";
import { PersonalMemory } from "../personal-data/personal-memory/service.ts";
import {
  type AppLogRow,
  type AppUser,
  countUsers,
  createUser,
  deleteUser,
  findLogsByUser,
  getUserByApiKey,
  getUserById,
  listUsers,
  updateUserApiKey,
  upsertUser,
} from "./dal.ts";
import {
  clampLogLimit,
  type LogItem,
  type LogsModel,
  resolveLogNames,
  type UsersModel,
} from "./model.ts";

export type { AppUser, AppUserRole } from "./dal.ts";

function normalizeUserId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  if (!id) return null;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id)) return null;
  return id;
}

function newApiKey(userId: string): string {
  return `demo-key-${userId}-${crypto.randomUUID().slice(0, 8)}`;
}

function userJson(user: AppUser) {
  return {
    id: user.id,
    apiKey: user.api_key,
    role: user.role,
    createdAt: user.created_at?.toISOString?.() ?? user.created_at ?? null,
  };
}

export type LogListResult = {
  items: LogItem[];
  nextCursor: string | null;
};

function rowToLogItem(row: AppLogRow): LogItem {
  return {
    id: row.id.toString(),
    level: row.level,
    msg: row.msg,
    name: row.name,
    userId: row.userId,
    meta: row.meta,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Cursor is the `id` of the last row on the previous page. Rows are ordered by
 * `id DESC` (autoincrement BigInt — strictly increasing with insert order).
 */
function parseLogCursor(raw: string | undefined): bigint | null {
  if (!raw) return null;
  try {
    const n = BigInt(raw);
    if (n <= 0n) return null;
    return n;
  } catch {
    throw status(400, { error: "Invalid cursor" });
  }
}

export abstract class Users {
  static async list() {
    const users = await listUsers();
    return { users: users.map(userJson) };
  }

  static async create(actor: AppUser | null, body: UsersModel["createBody"]) {
    if (!actor && (await countUsers()) > 0) {
      throw status(401, {
        error: "Unauthorized. Use Authorization: Bearer <api-key>.",
      });
    }

    const id = normalizeUserId(body.id);
    if (!id) {
      throw status(400, {
        error: "id is required (lowercase letter, then letters/digits/_/-)",
      });
    }

    const apiKey = body.apiKey?.trim() || newApiKey(id);
    const role = (await countUsers()) === 0 ? "admin" : "member";
    let user: AppUser;
    try {
      user = await createUser(id, apiKey, role);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(msg)) {
        throw status(409, { error: "User id or api key already exists" });
      }
      throw status(502, { error: msg });
    }
    return status(201, userJson(user));
  }

  static async get(idParam: string) {
    const id = normalizeUserId(idParam);
    if (!id) throw status(400, { error: "Invalid user id" });
    const user = await getUserById(id);
    if (!user) throw status(404, { error: "User not found" });
    return userJson(user);
  }

  static async update(idParam: string, body: UsersModel["updateBody"]) {
    const id = normalizeUserId(idParam);
    if (!id) throw status(400, { error: "Invalid user id" });

    const apiKey = body.apiKey?.trim() || newApiKey(id);
    let user: AppUser | null;
    try {
      user = await updateUserApiKey(id, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(msg)) {
        throw status(409, { error: "api key already in use" });
      }
      throw status(502, { error: msg });
    }
    if (!user) throw status(404, { error: "User not found" });
    return userJson(user);
  }

  static async remove(idParam: string) {
    const id = normalizeUserId(idParam);
    if (!id) throw status(400, { error: "Invalid user id" });

    const deleted = await deleteUser(id);
    if (!deleted) throw status(404, { error: "User not found" });
    return { deleted: true as const, id };
  }

  static async getData(idParam: string, query: UsersModel["dataQuery"]) {
    const id = normalizeUserId(idParam);
    if (!id) throw status(400, { error: "Invalid user id" });

    const user = await getUserById(id);
    if (!user) throw status(404, { error: "User not found" });

    const [memories, sessions, messagePageResult] = await Promise.all([
      PersonalMemory.listByUser(id),
      ChatSession.listByUser(id),
      ChatMessage.pageByUser(id, query.messagePage, undefined),
    ]);

    return {
      user: userJson(user),
      memories: memories.map((m) => ({
        id: m.id,
        slug: m.slug,
        content: m.content,
        createdAt: isoFromDate(m.created_at),
      })),
      sessions: sessions.map((s) => sessionJson(s)),
      messages: {
        items: messagePageResult.items.map((m) => ({
          id: m.id,
          sessionId: m.session_id,
          role: m.role,
          content: m.content,
          createdAt: isoFromDate(m.created_at),
        })),
        total: messagePageResult.total,
        page: messagePageResult.page,
        pageSize: messagePageResult.pageSize,
      },
    };
  }

  static async deleteMemory(idParam: string, memoryIdParam: string) {
    const id = normalizeUserId(idParam);
    if (!id) throw status(400, { error: "Invalid user id" });

    const memoryId = Number.parseInt(memoryIdParam, 10);
    if (!Number.isFinite(memoryId) || memoryId <= 0) {
      throw status(400, { error: "Invalid memory id" });
    }

    const deleted = await PersonalMemory.deleteByUser(id, memoryId);
    if (!deleted) throw status(404, { error: "Memory not found" });
    return { deleted: true as const, id: memoryId };
  }

  /** A user's `app_log` entries (newest first, cursor-paged). */
  static async listLogs(
    idParam: string,
    query: LogsModel["listQuery"],
  ): Promise<LogListResult> {
    const id = normalizeUserId(idParam);
    if (!id) throw status(400, { error: "Invalid user id" });

    const names = resolveLogNames(query.names);
    const limit = clampLogLimit(query.limit);
    const cursor = parseLogCursor(query.cursor);

    const rows = await findLogsByUser(id, {
      names,
      take: limit + 1,
      cursor,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map(rowToLogItem),
      nextCursor: hasMore && lastRow ? lastRow.id.toString() : null,
    };
  }

  /** Resolve a user by API key (auth). */
  static getByApiKey(apiKey: string): Promise<AppUser | null> {
    return getUserByApiKey(apiKey);
  }

  /** Insert or update a user by id (seeding). */
  static upsert(user: AppUser): Promise<AppUser> {
    return upsertUser(user);
  }
}
