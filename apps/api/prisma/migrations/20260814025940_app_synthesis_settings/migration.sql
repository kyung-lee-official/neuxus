-- CreateTable
CREATE TABLE "app_synthesis_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT,
    "synthesis_model" TEXT,
    "base_url" TEXT,
    "api_key" TEXT,
    "max_tokens" INTEGER,
    "context_window_tokens" INTEGER,

    CONSTRAINT "app_synthesis_settings_pkey" PRIMARY KEY ("id")
);
