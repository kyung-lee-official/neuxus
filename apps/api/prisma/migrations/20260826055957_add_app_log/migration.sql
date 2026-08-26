-- CreateTable
CREATE TABLE "app_log" (
    "id" BIGSERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "msg" TEXT NOT NULL,
    "name" TEXT,
    "meta" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_log_created_at_idx" ON "app_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "app_log_level_created_at_idx" ON "app_log"("level", "created_at" DESC);

-- CreateIndex
CREATE INDEX "app_log_name_created_at_idx" ON "app_log"("name", "created_at" DESC);
