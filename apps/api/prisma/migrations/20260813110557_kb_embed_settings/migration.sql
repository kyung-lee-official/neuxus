-- CreateTable
CREATE TABLE "kb_embed_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "embedding_model" TEXT,
    "provider" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "api_key" TEXT,

    CONSTRAINT "kb_embed_settings_pkey" PRIMARY KEY ("id")
);
