/*
  Warnings:

  - You are about to drop the `app_synthesis_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `kb_embed_settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "app_synthesis_settings";

-- DropTable
DROP TABLE "kb_embed_settings";

-- CreateTable
CREATE TABLE "app_model_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "embedding" JSONB,
    "llm" JSONB,
    "vision" JSONB,

    CONSTRAINT "app_model_config_pkey" PRIMARY KEY ("id")
);
