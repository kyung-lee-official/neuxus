/*
  Warnings:

  - You are about to drop the `app_memories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `app_messages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `app_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `app_users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "app_memories" DROP CONSTRAINT "app_memories_user_id_fkey";

-- DropForeignKey
ALTER TABLE "app_messages" DROP CONSTRAINT "app_messages_session_id_fkey";

-- DropForeignKey
ALTER TABLE "app_sessions" DROP CONSTRAINT "app_sessions_user_id_fkey";

-- DropTable
DROP TABLE "app_memories";

-- DropTable
DROP TABLE "app_messages";

-- DropTable
DROP TABLE "app_sessions";

-- DropTable
DROP TABLE "app_users";
