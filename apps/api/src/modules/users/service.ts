import { status } from "elysia";
import {
  type AppMessage,
  type AppUser,
  countMessagesForUser,
  countUsers,
  createUser,
  deleteMemoryForUser,
  deleteUser,
  findMessagesForUser,
  getUserById,
  listMemoriesForUser,
  listSessionsForUser,
  listUsers,
  updateUserApiKey,
} from "../../shared/db.ts";
import { isoFromDate, sessionJson, userJson } from "../../shared/serialize.ts";
import { Auth } from "../auth/service.ts";
import type { UsersModel } from "./model.ts";

export type MessagePage = {
  items: AppMessage[];
  total: number;
  page: number;
  pageSize: number;
};

const MESSAGE_PAGE_SIZE_DEFAULT = 50;
const MESSAGE_PAGE_SIZE_MAX = 200;

function normalizeUserId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  if (!id) return null;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id)) return null;
  return id;
}

function newApiKey(userId: string): string {
  return `demo-key-${userId}-${crypto.randomUUID().slice(0, 8)}`;
}

function clampPage(raw: string | number | undefined): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function clampPageSize(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
    return MESSAGE_PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.floor(raw), MESSAGE_PAGE_SIZE_MAX);
}

async function pageMessagesForUser(
  userId: string,
  rawPage: string | number | undefined,
  rawPageSize: number | undefined,
): Promise<MessagePage> {
  const page = clampPage(rawPage);
  const pageSize = clampPageSize(rawPageSize);
  const skip = (page - 1) * pageSize;
  const [total, items] = await Promise.all([
    countMessagesForUser(userId),
    findMessagesForUser(userId, { skip, take: pageSize }),
  ]);
  return { items, total, page, pageSize };
}

export abstract class Users {
  static async list() {
    const users = await listUsers();
    return { users: users.map(userJson) };
  }

  static async create(actor: AppUser | null, body: UsersModel["createBody"]) {
    if (!actor && (await countUsers()) > 0) throw Auth.unauthorized();

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
      listMemoriesForUser(id),
      listSessionsForUser(id),
      pageMessagesForUser(id, query.messagePage, undefined),
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

    const deleted = await deleteMemoryForUser(id, memoryId);
    if (!deleted) throw status(404, { error: "Memory not found" });
    return { deleted: true as const, id: memoryId };
  }
}
