/**
 * Upsert demo users into app_users (requires Prisma-migrated app schema).
 */
import {
  apiKeyForSeedUser,
  SEED_USER_IDS,
  type SeedUserId,
} from "../src/shared/config.ts";
import { type AppUser, closeDb, upsertUser } from "../src/shared/db.ts";

async function seedAppUsers(): Promise<AppUser[]> {
  const seeded: AppUser[] = [];
  for (const id of SEED_USER_IDS) {
    const role: AppUser["role"] =
      (id as SeedUserId) === "haewon" ? "admin" : "member";
    seeded.push(await upsertUser({ id, api_key: apiKeyForSeedUser(id), role }));
  }
  return seeded;
}

async function main(): Promise<void> {
  console.log("Seeding app users...");
  const users = await seedAppUsers();
  for (const user of users) {
    console.log(`  user ${user.id}: role=${user.role} api_key=${user.api_key}`);
  }
  console.log(`  (seed ids: ${SEED_USER_IDS.join(", ")}; haewon=admin)`);
  await closeDb();
}

await main();
