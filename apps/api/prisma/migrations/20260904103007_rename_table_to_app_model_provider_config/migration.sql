/*
  Warnings:

  - You are about to drop the `app_model_config` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "app_model_config";

-- CreateTable
CREATE TABLE "app_model_provider_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider_connections" JSONB,
    "tasks" JSONB,

    CONSTRAINT "app_model_provider_config_pkey" PRIMARY KEY ("id")
);
