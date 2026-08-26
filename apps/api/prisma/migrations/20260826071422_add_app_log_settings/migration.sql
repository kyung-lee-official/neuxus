-- CreateTable
CREATE TABLE "app_log_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sink" TEXT,
    "queue_size" INTEGER,
    "drain_timeout_ms" INTEGER,
    "pretty" BOOLEAN,

    CONSTRAINT "app_log_settings_pkey" PRIMARY KEY ("id")
);
