import type { AppUser } from "./db.ts";

export function isoFromDate(
  value: Date | string | undefined | null,
): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function userJson(user: AppUser) {
  return {
    id: user.id,
    apiKey: user.api_key,
    role: user.role,
    createdAt: user.created_at?.toISOString?.() ?? user.created_at ?? null,
  };
}

export function sessionJson(session: {
  id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: session.id,
    title: session.title,
    createdAt: isoFromDate(session.created_at),
    updatedAt: isoFromDate(session.updated_at),
  };
}
