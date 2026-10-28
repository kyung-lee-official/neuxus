import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { requireDatabaseUrl } from "./config.ts";

let prisma: PrismaClient | null = null;

/** Process-wide Prisma client. Lazy-initialized; safe to import without a DB. */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaPg(requireDatabaseUrl());
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/** Disconnect the Prisma client. Idempotent. */
export async function closeDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
