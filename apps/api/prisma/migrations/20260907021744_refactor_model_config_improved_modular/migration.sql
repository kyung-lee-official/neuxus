/*
  Warnings:

  - You are about to drop the column `tasks` on the `app_model_provider_config` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "app_model_provider_config" DROP COLUMN "tasks";

-- CreateTable
CREATE TABLE "app_model_task_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tasks" JSONB,

    CONSTRAINT "app_model_task_config_pkey" PRIMARY KEY ("id")
);
