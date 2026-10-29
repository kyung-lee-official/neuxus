-- CreateTable
CREATE TABLE "app_log" (
    "id" BIGSERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "msg" TEXT NOT NULL,
    "name" TEXT,
    "meta" JSONB NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_log_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "queue_size" INTEGER,
    "drain_timeout_ms" INTEGER,
    "pretty" BOOLEAN,

    CONSTRAINT "app_log_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_log_created_at_idx" ON "app_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "app_log_level_created_at_idx" ON "app_log"("level", "created_at" DESC);

-- CreateIndex
CREATE INDEX "app_log_name_created_at_idx" ON "app_log"("name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "app_log_user_id_created_at_idx" ON "app_log"("user_id", "created_at" DESC);
