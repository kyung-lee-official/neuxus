-- CreateTable
CREATE TABLE "agent_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "deepseek_api_key" TEXT,
    "max_tool_iterations" INTEGER,
    "stream_timeout_ms" INTEGER,
    "run_max_attempts" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("id")
);
