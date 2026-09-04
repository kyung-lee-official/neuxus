/*
  Warnings:

  - You are about to drop the column `embedding` on the `app_model_config` table. All the data in the column will be lost.
  - You are about to drop the column `llm` on the `app_model_config` table. All the data in the column will be lost.
  - You are about to drop the column `vision` on the `app_model_config` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "app_model_config" DROP COLUMN "embedding",
DROP COLUMN "llm",
DROP COLUMN "vision",
ADD COLUMN     "connections" JSONB,
ADD COLUMN     "tasks" JSONB;
