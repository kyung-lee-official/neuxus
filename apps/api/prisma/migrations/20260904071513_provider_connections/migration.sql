/*
  Warnings:

  - You are about to drop the column `connections` on the `app_model_config` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "app_model_config" DROP COLUMN "connections",
ADD COLUMN     "provider_connections" JSONB;
