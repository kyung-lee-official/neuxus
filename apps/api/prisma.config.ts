import { defineConfig } from "prisma/config";

/**
 * Prisma CLI datasource — `DATABASE_URL` (neuxus).
 * Load env via `bun --env-file=../../.env` (see package.json scripts).
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Set DATABASE_URL for Prisma (e.g. postgresql://…/neuxus). Use bun run prisma / prisma:generate from apps/api.",
    );
  }
  return url;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl(),
  },
});
